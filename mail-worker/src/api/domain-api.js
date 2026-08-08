import app from '../hono/hono';

import domainService from '../service/domain-service';
import result from '../model/result';
import userContext from '../security/user-context';
import userService from '../service/user-service';
import roleService from '../service/role-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const checkPermission = async (c) => {
	const userId = userContext.getUserId(c);
	const user = await userService.selectById(c, userId);
	if (user.email === c.env.admin) {
		return;
	}

	const role = await roleService.selectById(c, user.type);
	if (role && (role.name === 'ADMIN' || role.name === 'GWEH')) {
		return;
	}

	throw new BizError(t('unauthorized'), 403);
};

app.get('/domain/list', async (c) => {
	await checkPermission(c);
	const list = await domainService.list(c);
	return c.json(result.ok(list));
});

app.post('/domain/add', async (c) => {
	await checkPermission(c);
	const res = await domainService.add(c, await c.req.json());
	return c.json(result.ok(res));
});

app.post('/domain/verify', async (c) => {
	await checkPermission(c);
	const res = await domainService.verify(c, await c.req.json());
	return c.json(result.ok(res));
});

app.post('/domain/delete', async (c) => {
	await checkPermission(c);
	await domainService.delete(c, await c.req.json());
	return c.json(result.ok());
});
