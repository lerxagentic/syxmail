import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInsert, mockValues, mockReturning, mockGet } = vi.hoisted(() => {
	const mockGet = vi.fn();
	const mockReturning = vi.fn(() => ({ get: mockGet }));
	const mockValues = vi.fn(() => ({ returning: mockReturning }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockInsert, mockValues, mockReturning, mockGet };
});

vi.mock('../src/entity/orm', () => ({
	default: () => ({ insert: mockInsert })
}));

import emailService from '../src/service/email-service';

describe('emailService.receive', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('inserts email normally when schema is up to date', async () => {
		const expectedRow = { emailId: 100, subject: 'Test' };
		mockGet.mockResolvedValue(expectedRow);

		const c = { env: { db: { prepare: vi.fn() } } };
		const params = { subject: 'Test', code: '123456' };

		const result = await emailService.receive(c, params, [], undefined);
		expect(result).toEqual(expectedRow);
		expect(c.env.db.prepare).not.toHaveBeenCalled();
	});

	it('auto-migrates email table when code column is missing and retries insert', async () => {
		const expectedRow = { emailId: 101, subject: 'Migrated' };
		// First call fails with missing column, second succeeds after alter
		mockGet
			.mockRejectedValueOnce(new Error('no such column: code'))
			.mockResolvedValueOnce(expectedRow);

		const mockRun = vi.fn().mockResolvedValue({});
		const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
		const c = { env: { db: { prepare: mockPrepare } } };
		const params = { subject: 'Migrated', code: '654321' };

		const result = await emailService.receive(c, params, [], undefined);
		expect(result).toEqual(expectedRow);
		expect(mockPrepare).toHaveBeenCalledWith("ALTER TABLE email ADD COLUMN code TEXT NOT NULL DEFAULT '';");
		expect(mockRun).toHaveBeenCalled();
	});

	it('propagates other database errors without altering table', async () => {
		const failure = new Error('D1 storage quota exceeded');
		mockGet.mockRejectedValue(failure);

		const mockPrepare = vi.fn();
		const c = { env: { db: { prepare: mockPrepare } } };

		await expect(emailService.receive(c, { subject: 'Quota test' }, [], undefined)).rejects.toThrow('D1 storage quota exceeded');
		expect(mockPrepare).not.toHaveBeenCalled();
	});
});
