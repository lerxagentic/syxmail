import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readSetting } = vi.hoisted(() => ({ readSetting: vi.fn() }));
vi.mock('../src/entity/orm', () => ({
	default: () => ({ select: () => ({ from: () => ({ get: readSetting }) }) })
}));
vi.mock('../src/service/domain-service', () => ({ default: { list: async () => [] } }));
vi.mock('../src/service/r2-service', () => ({ default: {} }));
vi.mock('../src/service/verify-record-service', () => ({ default: {} }));
vi.mock('../src/security/user-context', () => ({ default: {} }));

import settingService from '../src/service/setting-service';
import KvConst from '../src/const/kv-const';

function context(cached) {
	return { env: { kv: { get: vi.fn().mockResolvedValue(cached), put: vi.fn().mockResolvedValue() } } };
}

describe('email settings lookup', () => {
	beforeEach(() => vi.clearAllMocks());

	it('recovers an absent cache from initialized D1 in email context', async () => {
		const row = { receive: 0, resendTokens: '{}', emailPrefixFilter: 'admin,support' };
		readSetting.mockResolvedValue(row);
		const c = context(null);
		const result = await settingService.query(c);
		expect(result.emailPrefixFilter).toEqual(['admin', 'support']);
		expect(c.env.kv.put).toHaveBeenCalledWith(KvConst.SETTING, JSON.stringify({ ...row, resendTokens: {}, emailRetentionRules: { domains: {}, users: {} }, emailRetentionDays: 7 }));
	});

	it.each([
		[undefined, []], ['', []], ['admin,,support', ['admin', 'support']], [['admin', 'support'], ['admin', 'support']]
	])('normalizes cached prefix filter %j', async (emailPrefixFilter, expected) => {
		const result = await settingService.query(context({ emailPrefixFilter }));
		expect(result.emailPrefixFilter).toEqual(expected);
		expect(readSetting).not.toHaveBeenCalled();
	});

	it('preserves the initialization error when D1 has no settings row', async () => {
		readSetting.mockResolvedValue(undefined);
		await expect(settingService.query(context(null))).rejects.toThrow('Database not initialized.');
	});

	it('preserves database failures during cache recovery', async () => {
		readSetting.mockRejectedValue(new Error('D1 unavailable'));
		await expect(settingService.query(context(null))).rejects.toThrow('D1 unavailable');
	});

	it('preserves cache write failures during recovery', async () => {
		readSetting.mockResolvedValue({ resendTokens: '{}', emailPrefixFilter: '' });
		const c = context(null);
		c.env.kv.put.mockRejectedValue(new Error('KV unavailable'));
		await expect(settingService.query(c)).rejects.toThrow('KV unavailable');
	});

	it('refreshes settings without requiring an HTTP context', async () => {
		readSetting.mockResolvedValue({ resendTokens: '{}', emailPrefixFilter: '' });
		const c = context(null);
		await expect(settingService.refresh(c)).resolves.toBeDefined();
		expect(c.env.kv.put).toHaveBeenCalledOnce();
	});

	it('caches normalized settings in HTTP context after recovering from D1', async () => {
		readSetting.mockResolvedValue({ resendTokens: '{}', emailPrefixFilter: 'admin,support' });
		const c = context(null);
		const state = new Map();
		c.get = key => state.get(key);
		c.set = (key, value) => state.set(key, value);
		const first = await settingService.query(c);
		const second = await settingService.query(c);
		expect(second).toBe(first);
		expect(second.emailPrefixFilter).toEqual(['admin', 'support']);
		expect(second.resendTokens).toEqual({});
		expect(readSetting).toHaveBeenCalledOnce();
		expect(c.env.kv.get).toHaveBeenCalledOnce();
	});
});
