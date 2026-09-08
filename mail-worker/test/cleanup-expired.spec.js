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
});
