import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/cleanup-expired.spec.js', 'test/email-receive.spec.js', 'test/setting-query.spec.js', 'test/email-service.spec.js']
	}
});
