import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import settingService from '../service/setting-service';
import domainService from '../service/domain-service';
import roleService from '../service/role-service';
import emailUtils from '../utils/email-utils';
import cryptoUtils from '../utils/crypto-utils';
import orm from '../entity/orm';
import account from '../entity/account';
import email from '../entity/email';
import { eq, and, desc, sql } from 'drizzle-orm';
import emailService from '../service/email-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// Helper to get allowed domains for a specific user role
async function getAvailDomainsForUser(c, userId) {
	const domainObjs = await domainService.list(c);
	const allDomains = (domainObjs || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean);

	if (!userId) return allDomains;

	const roleRow = await roleService.selectByUserId(c, userId);
	let rawAvailDomain = roleRow?.availDomain || '';

	if (rawAvailDomain) {
		let allowed = typeof rawAvailDomain === 'string' ? rawAvailDomain.split(',') : rawAvailDomain;
		allowed = allowed.map(item => String(item).trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
		if (allowed.length > 0) {
			return allDomains.filter(d => allowed.includes(d.toLowerCase()));
		}
	}

	return allDomains;
}

// 1. Get System Config & Allowed Domains for User
app.get('/config', async (c) => {
	const userId = userContext.getUserId(c);
	let domains = [];
	let roleName = 'Public';
	let maxEmails = 20;

	if (userId) {
		domains = await getAvailDomainsForUser(c, userId);
		const userObj = userContext.getUser(c);
		const roleRow = await roleService.selectByUserId(c, userId);
		roleName = roleRow?.name || (userObj?.email === c.env.admin ? 'Admin' : 'Regular User');
		if (roleRow && roleRow.accountCount !== undefined && roleRow.accountCount !== null && roleRow.accountCount > 0) {
			maxEmails = roleRow.accountCount;
		}
	} else {
		const domainObjs = await domainService.list(c);
		domains = (domainObjs || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean);
	}

	const setting = await settingService.query(c);
	return c.json({
		defaultRole: roleName,
		role: roleName,
		emailDomains: domains.join(','),
		availableDomains: domains,
		adminContact: c.env.admin || '',
		maxEmails: String(maxEmails),
		maxAddress: maxEmails,
		siteTitle: setting.title || 'SyxMail'
	});
});

// 2. Generate Temp Email / Mailbox
app.post('/emails/generate', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json().catch(() => ({}));

	const availDomains = await getAvailDomainsForUser(c, userId);
	if (!availDomains || availDomains.length === 0) {
		throw new BizError(t('notExistDomain') || 'No email domain available for your role');
	}

	let domain = body.domain;
	if (domain) {
		if (!availDomains.map(d => d.toLowerCase()).includes(domain.toLowerCase())) {
			throw new BizError(`Domain @${domain} is not available for your role (${availDomains.join(', ')})`);
		}
	} else {
		domain = availDomains[0];
	}

	let prefix = body.name ? body.name.trim().toLowerCase() : '';
	if (!prefix) {
		prefix = cryptoUtils.genRandomPwd(8).toLowerCase();
	}

	const fullEmail = `${prefix}@${domain}`;

	// Check if account exists
	const existing = await orm(c)
		.select()
		.from(account)
		.where(sql`${account.email} COLLATE NOCASE = ${fullEmail}`)
		.get();

	if (existing) {
		if (existing.userId === userId) {
			return c.json({
				id: String(existing.accountId),
				email: existing.email
			});
		}
		throw new BizError(t('isRegAccount') || 'Email prefix already taken');
	}

	// Insert new account
	const newAccount = await orm(c)
		.insert(account)
		.values({
			email: fullEmail,
			userId: userId,
			name: prefix
		})
		.returning()
		.get();

	return c.json({
		id: String(newAccount.accountId),
		email: newAccount.email
	});
});

// Helper for auto extracting OTP codes & verification links from email content
function extractCodeAndLinks(subject = '', text = '', content = '') {
	const fullText = `${subject || ''}\n${text || ''}\n${(content || '').replace(/<[^>]+>/g, ' ')}`;

	// 1. Extract URLs
	const urlRegex = /(https?:\/\/[^\s"<>'()]+)/gi;
	const matches = fullText.match(urlRegex) || [];
	const cleanLinks = [...new Set(matches.map(link => link.replace(/[\.,\)\>]+$/, '')))];

	let verificationUrl = '';
	if (cleanLinks.length > 0) {
		const keywords = ['verify', 'confirm', 'activate', 'validation', 'auth', 'token', 'login', 'reset'];
		verificationUrl = cleanLinks.find(link => {
			const l = link.toLowerCase();
			return keywords.some(k => l.includes(k));
		}) || cleanLinks[0];
	}

	// 2. Extract Verification Code / OTP
	let code = '';
	const kwRegex = /(?:code|otp|pin|verification|verifikasi|passcode|confirm|token)[\s:\=\-]*([a-zA-Z0-9]{4,8})\b/i;
	const kwMatch = fullText.match(kwRegex);
	if (kwMatch && kwMatch[1]) {
		code = kwMatch[1];
	}

	if (!code) {
		const digitRegex = /\b(\d{4,8})\b/g;
		const digitMatches = fullText.match(digitRegex) || [];
		if (digitMatches.length > 0) {
			const nonYear = digitMatches.find(m => m.length !== 4 || (!m.startsWith('202') && !m.startsWith('199')));
			code = nonYear || digitMatches[0];
		}
	}

	return {
		code,
		verificationCode: code,
		verificationUrl,
		links: cleanLinks
	};
}

function formatMessageResponse(msg) {
	const extracted = extractCodeAndLinks(msg.subject, msg.text, msg.content);
	const finalCode = msg.code || extracted.code;
	return {
		id: String(msg.emailId),
		messageId: String(msg.emailId),
		sendEmail: msg.sendEmail,
		sendName: msg.name,
		toEmail: msg.toEmail,
		subject: msg.subject,
		text: msg.text,
		content: msg.content,
		code: finalCode,
		verificationCode: finalCode,
		verificationUrl: extracted.verificationUrl,
		links: extracted.links,
		createTime: msg.createTime
	};
}

// 3. Get Email List (Mailboxes)
app.get('/emails', async (c) => {
	const userId = userContext.getUserId(c);
	const accounts = await orm(c)
		.select()
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.isDel, 0)))
		.orderBy(desc(account.accountId))
		.all();

	return c.json(
		accounts.map(acc => ({
			id: String(acc.accountId),
			email: acc.email,
			createTime: acc.createTime
		}))
	);
});

// 4. Get Messages for a specific Email Mailbox
app.get('/emails/:emailId', async (c) => {
	const userId = userContext.getUserId(c);
	const accountId = Number(c.req.param('emailId'));

	const messages = await orm(c)
		.select()
		.from(email)
		.where(and(eq(email.accountId, accountId), eq(email.userId, userId), eq(email.isDel, 0)))
		.orderBy(desc(email.emailId))
		.all();

	return c.json(messages.map(formatMessageResponse));
});

// 4.1 Realtime Long-Polling Wait for Verification Email (By Mailbox ID or Email Address)
app.get('/emails/wait', async (c) => {
	const userId = userContext.getUserId(c);
	const timeoutSec = Math.min(Number(c.req.query('timeout')) || 60, 120);
	const address = c.req.query('address') || c.req.query('email');
	let accountId = Number(c.req.query('emailId'));

	if (!accountId && address) {
		const acc = await orm(c)
			.select()
			.from(account)
			.where(and(eq(account.email, address), eq(account.userId, userId)))
			.get();
		if (acc) {
			accountId = acc.accountId;
		}
	}

	if (!accountId) {
		throw new BizError('Email mailbox ID or address is required', 400);
	}

	const lastMsgId = Number(c.req.query('lastMessageId')) || 0;
	const startTime = Date.now();
	const pollIntervalMs = 1500;

	while ((Date.now() - startTime) < timeoutSec * 1000) {
		const queryWhere = lastMsgId > 0
			? and(eq(email.accountId, accountId), eq(email.userId, userId), eq(email.isDel, 0), sql`${email.emailId} > ${lastMsgId}`)
			: and(eq(email.accountId, accountId), eq(email.userId, userId), eq(email.isDel, 0));

		const msg = await orm(c)
			.select()
			.from(email)
			.where(queryWhere)
			.orderBy(desc(email.emailId))
			.get();

		if (msg) {
			return c.json(formatMessageResponse(msg));
		}

		await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
	}

	return c.json({
		status: 'timeout',
		message: `No email received within ${timeoutSec} seconds timeout`
	}, 200);
});

app.get('/emails/:emailId/wait', async (c) => {
	const userId = userContext.getUserId(c);
	const accountId = Number(c.req.param('emailId'));
	const timeoutSec = Math.min(Number(c.req.query('timeout')) || 60, 120);
	const lastMsgId = Number(c.req.query('lastMessageId')) || 0;

	const startTime = Date.now();
	const pollIntervalMs = 1500;

	while ((Date.now() - startTime) < timeoutSec * 1000) {
		const queryWhere = lastMsgId > 0
			? and(eq(email.accountId, accountId), eq(email.userId, userId), eq(email.isDel, 0), sql`${email.emailId} > ${lastMsgId}`)
			: and(eq(email.accountId, accountId), eq(email.userId, userId), eq(email.isDel, 0));

		const msg = await orm(c)
			.select()
			.from(email)
			.where(queryWhere)
			.orderBy(desc(email.emailId))
			.get();

		if (msg) {
			return c.json(formatMessageResponse(msg));
		}

		await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
	}

	return c.json({
		status: 'timeout',
		message: `No email received within ${timeoutSec} seconds timeout`
	}, 200);
});

// 5. Get Single Message Detail
app.get('/emails/:emailId/:messageId', async (c) => {
	const userId = userContext.getUserId(c);
	const messageId = Number(c.req.param('messageId'));

	const msg = await orm(c)
		.select()
		.from(email)
		.where(and(eq(email.emailId, messageId), eq(email.userId, userId), eq(email.isDel, 0)))
		.get();

	if (!msg) {
		throw new BizError(t('notExistData') || 'Message not found', 404);
	}

	return c.json(formatMessageResponse(msg));
});

// 6. Delete Mailbox
app.delete('/emails/:emailId', async (c) => {
	const userId = userContext.getUserId(c);
	const accountId = Number(c.req.param('emailId'));

	const acc = await orm(c)
		.select()
		.from(account)
		.where(and(eq(account.accountId, accountId), eq(account.userId, userId)))
		.get();

	if (acc) {
		await orm(c).delete(account).where(eq(account.accountId, accountId));
	}

	return c.json(result.ok());
});

// 7. Send Email from Temporary Address
app.post('/emails/:emailId/send', async (c) => {
	const userId = userContext.getUserId(c);
	const accountId = Number(c.req.param('emailId'));
	const body = await c.req.json();

	const acc = await orm(c)
		.select()
		.from(account)
		.where(and(eq(account.accountId, accountId), eq(account.userId, userId)))
		.get();

	if (!acc) {
		throw new BizError(t('notExistData') || 'Mailbox not found', 404);
	}

	const sendRes = await emailService.send(
		c,
		{
			accountId,
			sendEmail: acc.email,
			toEmail: body.to || body.toEmail,
			subject: body.subject,
			content: body.content
		},
		userId
	);

	return c.json(result.ok(sendRes));
});

// 8. Get User Role Info & Available Domains per Role
app.get('/user/role', async (c) => {
	const userId = userContext.getUserId(c);
	const userObj = userContext.getUser(c);
	const roleRow = await roleService.selectByUserId(c, userId);
	const availDomains = await getAvailDomainsForUser(c, userId);
	const domainObjs = await domainService.list(c);
	const allDomains = (domainObjs || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean);

	return c.json({
		userId,
		email: userObj?.email || '',
		roleId: roleRow?.roleId || null,
		roleName: roleRow?.name || (userObj?.email === c.env.admin ? 'Admin' : 'Regular User'),
		availDomains,
		allSystemDomains: allDomains,
		maxAddress: roleRow?.accountCount ?? 20,
		maxEmails: String(roleRow?.accountCount ?? 20),
		sendType: roleRow?.sendType || 'count',
		sendCount: roleRow?.sendCount ?? 0,
		banEmail: roleRow?.banEmail ? (typeof roleRow.banEmail === 'string' ? roleRow.banEmail.split(',').filter(Boolean) : roleRow.banEmail) : []
	});
});

// 9. Get List of Available Email Domains per Role
app.get('/domains', async (c) => {
	const userId = userContext.getUserId(c);
	const availDomains = await getAvailDomainsForUser(c, userId);
	const domainObjs = await domainService.list(c);
	const allDomains = (domainObjs || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean);

	return c.json({
		domains: availDomains,
		allDomains
	});
});
