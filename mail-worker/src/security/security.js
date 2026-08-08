import BizError from '../error/biz-error';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';
import userService from '../service/user-service';
import permService from '../service/perm-service';
import apiKeyService from '../service/api-key-service';
import { t } from '../i18n/i18n'
import app from '../hono/hono';

const exclude = [
	'/login',
	'/register',
	'/oss',
	'/setting/websiteConfig',
	'/webhooks',
	'/init',
	'/public/genToken',
	'/telegram',
	'/test',
	'/oauth',
	'/swagger',
	'/openapi.json',
	'/config'
];

const requirePerms = [
	'/email/send',
	'/email/delete',
	'/account/list',
	'/account/delete',
	'/account/add',
	'/my/delete',
	'/analysis/echarts',
	'/role/add',
	'/role/list',
	'/role/delete',
	'/role/tree',
	'/role/set',
	'/role/setDefault',
	'/allEmail/list',
	'/allEmail/delete',
	'/allEmail/batchDelete',
	'/allEmail/latest',
	'/setting/setBackground',
	'/setting/deleteBackground',
	'/setting/set',
	'/setting/query',
	'/setting/setBlacklist',
	'/user/delete',
	'/user/setPwd',
	'/user/setStatus',
	'/user/setType',
	'/user/list',
	'/user/restore',
	'/user/resetSendCount',
	'/user/add',
	'/user/deleteAccount',
	'/user/allAccount',
	'/regKey/add',
	'/regKey/list',
	'/regKey/delete',
	'/regKey/clearNotUse',
	'/regKey/history',
	'/apiKey/list',
	'/apiKey/create',
	'/apiKey/delete',
	'/apiKey/allList',
	'/apiKey/adminCreate',
	'/apiKey/adminDelete'
];

const premKey = {
	'email:delete': ['/email/delete'],
	'email:send': ['/email/send'],
	'account:add': ['/account/add'],
	'account:query': ['/account/list'],
	'account:delete': ['/account/delete'],
	'my:delete': ['/my/delete'],
	'role:add': ['/role/add'],
	'role:set': ['/role/set','/role/setDefault'],
	'role:query': ['/role/list', '/role/tree'],
	'role:delete': ['/role/delete'],
	'user:query': ['/user/list','/user/allAccount'],
	'user:add': ['/user/add'],
	'user:reset-send': ['/user/resetSendCount'],
	'user:set-pwd': ['/user/setPwd'],
	'user:set-status': ['/user/setStatus', '/user/restore'],
	'user:set-type': ['/user/setType'],
	'user:delete': ['/user/delete','/user/deleteAccount'],
	'all-email:query': ['/allEmail/list','/allEmail/latest'],
	'all-email:delete': ['/allEmail/delete','/allEmail/batchDelete'],
	'setting:query': ['/setting/query'],
	'setting:set': ['/setting/set', '/setting/setBackground','/setting/deleteBackground','/setting/setBlacklist'],
	'analysis:query': ['/analysis/echarts'],
	'reg-key:add': ['/regKey/add'],
	'reg-key:query': ['/regKey/list','/regKey/history'],
	'reg-key:delete': ['/regKey/delete','/regKey/clearNotUse'],
	'api-key:query': ['/apiKey/list'],
	'api-key:create': ['/apiKey/create'],
	'api-key:delete': ['/apiKey/delete'],
	'api-key:admin': ['/apiKey/allList', '/apiKey/adminCreate', '/apiKey/adminDelete']
};

app.use('*', async (c, next) => {

	const path = c.req.path;

	// Extract token or API Key if present
	let headerAuth = c.req.header('X-API-Key') || c.req.header(constant.TOKEN_HEADER) || c.req.header('authorization');
	if (headerAuth && headerAuth.toLowerCase().startsWith('bearer ')) {
		headerAuth = headerAuth.substring(7).trim();
	}

	if (headerAuth) {
		if (headerAuth.startsWith('sk_live_')) {
			const apiKeyInfo = await apiKeyService.verifyApiKey(c, headerAuth);
			if (apiKeyInfo) {
				c.set('user', apiKeyInfo.user);
			}
		} else {
			const result = await jwtUtils.verifyToken(c, headerAuth);
			if (result) {
				const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + result.userId, { type: 'json' });
				if (authInfo && authInfo.tokens && authInfo.tokens.includes(result.token)) {
					c.set('user', authInfo.user);
				}
			}
		}
	}

	const index = exclude.findIndex(item => {
		return path.startsWith(item);
	});

	if (index > -1) {
		return await next();
	}

	if (path.startsWith('/public')) {

		const userPublicToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		const publicToken = c.req.header(constant.TOKEN_HEADER);
		if (publicToken !== userPublicToken) {
			throw new BizError(t('publicTokenFail'), 401);
		}
		return await next();
	}

	// Extract token or API Key
	headerAuth = c.req.header('X-API-Key') || c.req.header(constant.TOKEN_HEADER) || c.req.header('authorization');
	if (headerAuth && headerAuth.toLowerCase().startsWith('bearer ')) {
		headerAuth = headerAuth.substring(7).trim();
	}

	// 1. Try API Key verification first if header starts with sk_live_
	if (headerAuth && headerAuth.startsWith('sk_live_')) {
		const apiKeyInfo = await apiKeyService.verifyApiKey(c, headerAuth);
		if (!apiKeyInfo) {
			throw new BizError(t('authExpired'), 401);
		}

		c.set('user', apiKeyInfo.user);

		// Check permission requirement
		const permIndex = requirePerms.findIndex(item => path.startsWith(item));
		if (permIndex > -1) {
			const permKeys = await permService.userPermKeys(c, apiKeyInfo.userId);
			const userPaths = permKeyToPaths(permKeys);

			const userPermIndex = userPaths.findIndex(item => path.startsWith(item));
			if (userPermIndex === -1 && apiKeyInfo.user.email !== c.env.admin) {
				throw new BizError(t('unauthorized'), 403);
			}
		}

		return await next();
	}

	// 2. JWT Verification
	const jwt = headerAuth;
	const result = await jwtUtils.verifyToken(c, jwt);

	if (!result) {
		throw new BizError(t('authExpired'), 401);
	}

	const { userId, token } = result;
	const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });

	if (!authInfo) {
		throw new BizError(t('authExpired'), 401);
	}

	if (!authInfo.tokens.includes(token)) {
		throw new BizError(t('authExpired'), 401);
	}

	const permIndex = requirePerms.findIndex(item => {
		return path.startsWith(item);
	});

	if (permIndex > -1) {

		const permKeys = await permService.userPermKeys(c, authInfo.user.userId);

		const userPaths = permKeyToPaths(permKeys);

		const userPermIndex = userPaths.findIndex(item => {
			return path.startsWith(item);
		});

		if (userPermIndex === -1 && authInfo.user.email !== c.env.admin) {
			throw new BizError(t('unauthorized'), 403);
		}

	}

	const refreshTime = dayjs(authInfo.refreshTime).startOf('day');
	const nowTime = dayjs().startOf('day')

	if (!nowTime.isSame(refreshTime)) {
		authInfo.refreshTime = dayjs().toISOString();
		await userService.updateUserInfo(c, authInfo.user.userId);
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
	}

	c.set('user',authInfo.user)

	return await next();
});

function permKeyToPaths(permKeys) {

	const paths = [];

	for (const key of permKeys) {
		const routeList = premKey[key];
		if (routeList && Array.isArray(routeList)) {
			paths.push(...routeList);
		}
	}
	return paths;
}
