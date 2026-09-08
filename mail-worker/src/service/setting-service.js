import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';

const settingService = {

	async refresh(c) {
		let settingRow;
		try {
			settingRow = await orm(c).select().from(setting).get();
		} catch (e) {
			if (e.message && (e.message.includes('no such column') || e.message.includes('has no column named'))) {
				console.warn('Missing column in setting table, applying schema patch...', e.message);
				const alterSqls = [
					`ALTER TABLE setting ADD COLUMN ai_code INTEGER NOT NULL DEFAULT 1;`,
					`ALTER TABLE setting ADD COLUMN ai_code_filter TEXT NOT NULL DEFAULT '';`,
					`ALTER TABLE setting ADD COLUMN domain TEXT NOT NULL DEFAULT '[]';`,
					`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`,
					`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`,
					`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`,
					`ALTER TABLE setting ADD COLUMN email_retention_days INTEGER NOT NULL DEFAULT 7;`,
					`ALTER TABLE setting ADD COLUMN email_retention_rules TEXT NOT NULL DEFAULT '{}';`
				];
				for (const sql of alterSqls) {
					try { await c.env.db.prepare(sql).run(); } catch (_) {}
				}
				settingRow = await orm(c).select().from(setting).get();
			} else {
				throw e;
			}
		}

		if (!settingRow) {
			throw new BizError('Database not initialized.');
		}

		// Ensure high-performance D1 indexes exist to protect against Full Table Scans
		const indexSqls = [
			`CREATE INDEX IF NOT EXISTS idx_account_email ON account(email);`,
			`CREATE INDEX IF NOT EXISTS idx_email_status_create_time ON email(status, create_time);`,
			`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);`,
			`CREATE INDEX IF NOT EXISTS idx_star_email_id ON star(email_id);`
		];
		for (const sql of indexSqls) {
			try { await c.env.db.prepare(sql).run(); } catch (_) {}
		}

		let resendTokens = {};
		try {
			resendTokens = typeof settingRow.resendTokens === 'string' ? JSON.parse(settingRow.resendTokens) : (settingRow.resendTokens || {});
		} catch (_) {
			resendTokens = {};
		}

		let emailRetentionRules = { domains: {}, users: {} };
		try {
			emailRetentionRules = typeof settingRow.emailRetentionRules === 'string'
				? JSON.parse(settingRow.emailRetentionRules)
				: (settingRow.emailRetentionRules || { domains: {}, users: {} });
		} catch (_) {
			emailRetentionRules = { domains: {}, users: {} };
		}
		const emailRetentionDays = Number.isFinite(Number(settingRow.emailRetentionDays))
			? Number(settingRow.emailRetentionDays)
			: 7;

		const cachedSetting = { ...settingRow, resendTokens, emailRetentionRules, emailRetentionDays };
		if (c.env?.kv) {
			await c.env.kv.put(KvConst.SETTING, JSON.stringify(cachedSetting));
		}
		c.set?.('setting', cachedSetting);
		return cachedSetting;
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const cachedSetting = c.env?.kv ? await c.env.kv.get(KvConst.SETTING, { type: 'json' }) : null;
		const setting = { ...(cachedSetting || await this.refresh(c)) };

		if (typeof setting.resendTokens === 'string') {
			try {
				setting.resendTokens = JSON.parse(setting.resendTokens);
			} catch (_) {
				setting.resendTokens = {};
			}
		}

		if (typeof setting.emailRetentionRules === 'string') {
			try {
				setting.emailRetentionRules = JSON.parse(setting.emailRetentionRules);
			} catch (_) {
				setting.emailRetentionRules = { domains: {}, users: {} };
			}
		} else if (!setting.emailRetentionRules) {
			setting.emailRetentionRules = { domains: {}, users: {} };
		}
		setting.emailRetentionDays = Number.isFinite(Number(setting.emailRetentionDays)) ? Number(setting.emailRetentionDays) : 7;
		if (!setting.resendTokens) {
			setting.resendTokens = {};
		}

		let domainList = [];
		try {
			const domainService = (await import('./domain-service')).default;
			const activeDomains = await domainService.list(c);
			if (Array.isArray(activeDomains)) {
				domainList = activeDomains.map((d) => (typeof d === 'string' ? d : d.name));
			}
		} catch (e) {
			console.warn('Failed to fetch active domains from domainService:', e.message);
		}

		if (!domainList || domainList.length === 0) {
			let envDomains = c.env?.domain || [];
			if (typeof envDomains === 'string') {
				try {
					envDomains = JSON.parse(envDomains);
				} catch (error) {
					envDomains = [];
				}
			}
			domainList = Array.isArray(envDomains) ? envDomains : [];
		}

		const uniqueDomains = Array.from(new Set(domainList.map((d) => String(d).replace(/^@/, '').trim()).filter(Boolean)));
		setting.domainList = uniqueDomains.map((item) => '@' + item);


		let linuxdoSwitch = c.env?.linuxdo_switch;
		let projectLink = c.env?.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.linuxdoClientId = c.env?.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env?.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.emailPrefixFilter = (Array.isArray(setting.emailPrefixFilter)
			? setting.emailPrefixFilter
			: (setting.emailPrefixFilter || '').split(',')).filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.emailRetentionRules && typeof params.emailRetentionRules === 'object') {
			params.emailRetentionRules = JSON.stringify(params.emailRetentionRules);
		}

		if (params.emailRetentionDays !== undefined) {
			params.emailRetentionDays = Number(params.emailRetentionDays) || 7;
		}

		params.resendTokens = JSON.stringify(resendTokens);
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async addDomain(c, domain) {
		let settingRow;
		try {
			settingRow = await orm(c).select().from(setting).get();
		} catch (e) {
			if (e.message && e.message.includes('no such column: domain')) {
				try { await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN domain TEXT NOT NULL DEFAULT '[]';`).run(); } catch(err){}
				settingRow = await orm(c).select().from(setting).get();
			} else {
				throw e;
			}
		}
		let dbDomains = [];
		if (settingRow && settingRow.domain) {
			try {
				dbDomains = JSON.parse(settingRow.domain);
			} catch (e) {
				dbDomains = [];
			}
		}

		if (!dbDomains.includes(domain)) {
			dbDomains.push(domain);
			try {
				await orm(c)
					.update(setting)
					.set({
						domain: JSON.stringify(dbDomains),
					})
					.run();
			} catch (e) {
				if (e.message && e.message.includes('no such column: domain')) {
					try { await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN domain TEXT NOT NULL DEFAULT '[]';`).run(); } catch(err){}
					await orm(c)
						.update(setting)
						.set({
							domain: JSON.stringify(dbDomains),
						})
						.run();
				} else {
					throw e;
				}
			}
			await this.refresh(c);
		}
	},

	async removeDomain(c, domain) {
		let settingRow;
		try {
			settingRow = await orm(c).select().from(setting).get();
		} catch (e) {
			if (e.message && e.message.includes('no such column: domain')) {
				try { await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN domain TEXT NOT NULL DEFAULT '[]';`).run(); } catch(err){}
				settingRow = await orm(c).select().from(setting).get();
			} else {
				throw e;
			}
		}
		let dbDomains = [];
		if (settingRow && settingRow.domain) {
			try {
				dbDomains = JSON.parse(settingRow.domain);
			} catch (e) {
				dbDomains = [];
			}
		}

		if (dbDomains.includes(domain)) {
			dbDomains = dbDomains.filter((d) => d !== domain);
			try {
				await orm(c)
					.update(setting)
					.set({
						domain: JSON.stringify(dbDomains),
					})
					.run();
			} catch (e) {
				if (e.message && e.message.includes('no such column: domain')) {
					try { await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN domain TEXT NOT NULL DEFAULT '[]';`).run(); } catch(err){}
					await orm(c)
						.update(setting)
						.set({
							domain: JSON.stringify(dbDomains),
						})
						.run();
				} else {
					throw e;
				}
			}
			await this.refresh(c);
		}
	},

	async websiteConfig(c) {


		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
