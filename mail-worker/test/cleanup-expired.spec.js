import { describe, expect, it } from 'vitest';
import emailService from '../src/service/email-service';

describe('email storage cleanup', () => {
	it('deletes one bounded batch and reports deleted email rows', async () => {
		const prepared = [];
		const batches = [];
		const env = {
			db: {
				prepare(sql) {
					const statement = {
						sql,
						bind(...params) {
							prepared.push({ sql, params });
							return {
								sql,
								params,
								all: async () => sql.trimStart().startsWith('WITH target AS')
									? { results: [] }
									: { results: [{ email_id: 1 }, { email_id: 2 }] }
							};
						}
					};
					return statement;
				},
				async batch(statements) {
					batches.push(statements);
					return [
						{ meta: { changes: 0 } },
						{ meta: { changes: 0 } },
						{ meta: { changes: 2 } }
					];
				}
			},
			kv: {}
		};

		expect(await emailService.cleanupExpired({ env })).toBe(2);
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(3);
		expect(prepared[0].params[1]).toBe(500);
		expect(batches[0].every(statement => statement.sql.includes('WITH target AS'))).toBe(true);
	});

	it('respects configurable retention days such as 1 day', async () => {
		let boundCutoff = null;
		const env = {
			EMAIL_RETENTION_DAYS: 1,
			db: {
				prepare(sql) {
					return {
						bind(...params) {
							boundCutoff = params[0];
							return {
								all: async () => ({ results: [] })
							};
						}
					};
				}
			}
		};

		const result = await emailService.cleanupExpired({ env });
		expect(result).toBe(0);
		expect(boundCutoff).toBeDefined();
		// Cutoff date for 1 day retention must be recent (within the last 24-48 hours)
		const diffHours = (Date.now() - new Date(boundCutoff).getTime()) / (1000 * 60 * 60);
		expect(diffHours).toBeGreaterThan(20);
		expect(diffHours).toBeLessThan(30);
	});

	it('evaluates per-domain and per-user retention rules correctly', async () => {
		let capturedSql = null;
		let capturedParams = [];
		const env = {
			kv: {
				get: async () => ({
					emailRetentionDays: 30,
					emailRetentionRules: {
						domains: { 'temporary.tech': 1 },
						users: { '99': 3, 'vip@lerxagentic.tech': 60 }
					}
				})
			},
			db: {
				prepare(sql) {
					return {
						bind(...params) {
							capturedSql = sql;
							capturedParams = params;
							return {
								all: async () => ({ results: [] })
							};
						}
					};
				}
			}
		};

		const result = await emailService.cleanupExpired({ env });
		expect(result).toBe(0);
		expect(capturedSql).toContain('to_email LIKE ?');
		expect(capturedSql).toContain('user_id = ?');
		expect(capturedSql).toContain('to_email = ?');
		expect(capturedParams).toContain('%@temporary.tech');
		expect(capturedParams).toContain(99);
		expect(capturedParams).toContain('vip@lerxagentic.tech');
	});
});
