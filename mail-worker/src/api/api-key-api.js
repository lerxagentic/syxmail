import app from '../hono/hono';
import result from '../model/result';
import apiKeyService from '../service/api-key-service';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// User endpoints
app.get('/apiKey/list', async (c) => {
	const list = await apiKeyService.listKeys(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/apiKey/create', async (c) => {
	const body = await c.req.json();
	const keyData = await apiKeyService.createKey(c, {
		userId: userContext.getUserId(c),
		name: body.name
	});
	return c.json(result.ok(keyData));
});

app.delete('/apiKey/delete', async (c) => {
	const keyId = Number(c.req.query('keyId'));
	await apiKeyService.deleteKey(c, keyId, userContext.getUserId(c));
	return c.json(result.ok());
});

// Admin endpoints (Strict Admin Check)
app.get('/apiKey/allList', async (c) => {
	const user = c.get('user');
	if (!user || user.email !== c.env.admin) {
		throw new BizError(t('unauthorized'), 403);
	}
	const data = await apiKeyService.listAllKeys(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/apiKey/adminCreate', async (c) => {
	const user = c.get('user');
	if (!user || user.email !== c.env.admin) {
		throw new BizError(t('unauthorized'), 403);
	}
	const body = await c.req.json();
	const keyData = await apiKeyService.createKey(c, {
		userId: Number(body.userId),
		name: body.name
	});
	return c.json(result.ok(keyData));
});

app.delete('/apiKey/adminDelete', async (c) => {
	const user = c.get('user');
	if (!user || user.email !== c.env.admin) {
		throw new BizError(t('unauthorized'), 403);
	}
	const keyId = Number(c.req.query('keyId'));
	await apiKeyService.deleteKey(c, keyId, userContext.getUserId(c), true);
	return c.json(result.ok());
});
