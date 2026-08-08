import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const apiKey = sqliteTable('api_key', {
	keyId: integer('key_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	keyPrefix: text('key_prefix').notNull(),
	keyHash: text('key_hash').notNull(),
	createTime: text('create_time'),
	lastUsedTime: text('last_used_time')
});

export default apiKey;
