import orm from '../entity/orm';
import apiKeyEntity from '../entity/api-key';
import userEntity from '../entity/user';
import { eq, and, desc, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';
import userService from './user-service';

const KvPrefix = 'API_KEY:';

const apiKeyService = {
	/**
	 * Generate a random SHA-256 hex hash for string input
	 */
	async hashString(str) {
		const encoder = new TextEncoder();
		const data = encoder.encode(str);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return Array.from(new Uint8Array(hashBuffer))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
	},

	/**
	 * Generate a random string for API Key
	 */
	generateRawKey() {
		const array = new Uint8Array(24);
		crypto.getRandomValues(array);
		const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
		return `sk_live_${hex}`;
	},

	/**
	 * Create a new API Key for user
	 */
	async createKey(c, { userId, name }) {
		if (!name || !name.trim()) {
			throw new BizError(t('nameEmpty') || 'Name cannot be empty');
		}

		const rawKey = this.generateRawKey();
		const keyHash = await this.hashString(rawKey);
		const keyPrefix = rawKey.substring(0, 12) + '...';
		const createTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const insertResult = await orm(c).insert(apiKeyEntity).values({
			userId,
			name: name.trim(),
			keyPrefix,
			keyHash,
			createTime
		}).returning();

		const newKey = insertResult[0];

		// Cache in KV
		const cacheData = {
			keyId: newKey.keyId,
			userId,
			name: newKey.name,
			keyPrefix,
			createTime
		};
		await c.env.kv.put(`${KvPrefix}${keyHash}`, JSON.stringify(cacheData));

		return {
			keyId: newKey.keyId,
			apiKey: rawKey,
			name: newKey.name,
			keyPrefix,
			createTime
		};
	},

	/**
	 * Get list of API Keys for a specific user
	 */
	async listKeys(c, userId) {
		return await orm(c)
			.select({
				keyId: apiKeyEntity.keyId,
				name: apiKeyEntity.name,
				keyPrefix: apiKeyEntity.keyPrefix,
				createTime: apiKeyEntity.createTime,
				lastUsedTime: apiKeyEntity.lastUsedTime
			})
			.from(apiKeyEntity)
			.where(eq(apiKeyEntity.userId, userId))
			.orderBy(desc(apiKeyEntity.keyId))
			.all();
	},

	/**
	 * Admin: Get API keys of all users with optional filtering
	 */
	async listAllKeys(c, params = {}) {
		let { email, num = 1, size = 20 } = params;
		num = Number(num);
		size = Number(size);
		const offset = (num - 1) * size;

		const query = orm(c)
			.select({
				keyId: apiKeyEntity.keyId,
				userId: apiKeyEntity.userId,
				userEmail: userEntity.email,
				name: apiKeyEntity.name,
				keyPrefix: apiKeyEntity.keyPrefix,
				createTime: apiKeyEntity.createTime,
				lastUsedTime: apiKeyEntity.lastUsedTime
			})
			.from(apiKeyEntity)
			.leftJoin(userEntity, eq(apiKeyEntity.userId, userEntity.userId));

		if (email) {
			query.where(sql`${userEntity.email} COLLATE NOCASE LIKE ${'%' + email + '%'}`);
		}

		const list = await query
			.orderBy(desc(apiKeyEntity.keyId))
			.limit(size)
			.offset(offset)
			.all();

		// Count total
		const countResult = await orm(c)
			.select({ count: sql`COUNT(*)` })
			.from(apiKeyEntity)
			.get();

		return {
			list,
			total: countResult ? Number(countResult.count) : 0
		};
	},

	/**
	 * Delete/Revoke an API Key
	 */
	async deleteKey(c, keyId, currentUserId, isAdmin = false) {
		const keyRow = await orm(c)
			.select()
			.from(apiKeyEntity)
			.where(eq(apiKeyEntity.keyId, keyId))
			.get();

		if (!keyRow) {
			throw new BizError(t('notExistData') || 'API Key not found');
		}

		if (!isAdmin && keyRow.userId !== currentUserId) {
			throw new BizError(t('unauthorized'), 403);
		}

		// Remove from DB
		await orm(c).delete(apiKeyEntity).where(eq(apiKeyEntity.keyId, keyId));

		// Remove from KV cache
		await c.env.kv.delete(`${KvPrefix}${keyRow.keyHash}`);
	},

	/**
	 * Verify an incoming API Key and return user context
	 */
	async verifyApiKey(c, rawKey) {
		if (!rawKey || !rawKey.startsWith('sk_live_')) {
			return null;
		}

		const keyHash = await this.hashString(rawKey);
		const cacheKey = `${KvPrefix}${keyHash}`;

		let cacheData = await c.env.kv.get(cacheKey, { type: 'json' });

		if (!cacheData) {
			// Search DB if not in KV
			const keyRow = await orm(c)
				.select()
				.from(apiKeyEntity)
				.where(eq(apiKeyEntity.keyHash, keyHash))
				.get();

			if (!keyRow) {
				return null;
			}

			cacheData = {
				keyId: keyRow.keyId,
				userId: keyRow.userId,
				name: keyRow.name,
				keyPrefix: keyRow.keyPrefix,
				createTime: keyRow.createTime
			};

			// Cache in KV
			await c.env.kv.put(cacheKey, JSON.stringify(cacheData));
		}

		// Update last_used_time asynchronously (non-blocking)
		const nowStr = dayjs().format('YYYY-MM-DD HH:mm:ss');
		c.executionCtx?.waitUntil(
			orm(c)
				.update(apiKeyEntity)
				.set({ lastUsedTime: nowStr })
				.where(eq(apiKeyEntity.keyId, cacheData.keyId))
		);

		// Get User info & permissions
		const userRow = await userService.selectById(c, cacheData.userId);
		if (!userRow || userRow.isDel) {
			return null;
		}

		return {
			userId: userRow.userId,
			user: userRow
		};
	}
};

export default apiKeyService;
