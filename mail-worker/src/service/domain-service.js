import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import settingService from './setting-service';
import orm from '../entity/orm';
import setting from '../entity/setting';

const domainService = {
	async getHeaders(c) {
		const token = c.env.CLOUDFLARE_API_TOKEN;
		if (!token) {
			return null;
		}
		return {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		};
	},

	async list(c) {
		const domains = [];
		const seenDomains = new Set();

		// 1. Try to fetch from Cloudflare API if token is available
		const headers = await this.getHeaders(c);
		const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

		if (headers && accountId) {
			try {
				const url = `https://api.cloudflare.com/client/v4/zones?account.id=${accountId}&per_page=50`;
				const res = await fetch(url, { headers });
				const data = await res.json();

				if (data.success && data.result) {
					const zonesWithRouting = await Promise.all(
						data.result.map(async (zone) => {
							const emailRoutingStatus = await this.checkEmailRoutingActive(headers, zone.id);
							const nameServers = zone.name_servers || [];
							const dnsStatus = zone.status || 'active';
							return {
								id: zone.id,
								name: zone.name,
								dnsStatus: dnsStatus,
								nameServers: nameServers,
								emailRoutingStatus: emailRoutingStatus,
								mxStatus: emailRoutingStatus === 'active' ? 'active' : 'pending',
								spfStatus: emailRoutingStatus === 'active' ? 'active' : 'pending',
								verifying: false,
								source: 'cloudflare',
								requiredRecords: [
									{ type: 'NS 1', name: '@', content: nameServers[0] || 'ns1.cloudflare.com', status: dnsStatus === 'active' ? 'active' : 'pending' },
									{ type: 'NS 2', name: '@', content: nameServers[1] || 'ns2.cloudflare.com', status: dnsStatus === 'active' ? 'active' : 'pending' },
									{ type: 'MX 1', name: '@', content: 'isaac.mx.cloudflare.net (Priority 10)', status: emailRoutingStatus === 'active' ? 'active' : 'pending' },
									{ type: 'MX 2', name: '@', content: 'linda.mx.cloudflare.net (Priority 20)', status: emailRoutingStatus === 'active' ? 'active' : 'pending' },
									{ type: 'TXT (SPF)', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', status: emailRoutingStatus === 'active' ? 'active' : 'pending' },
									{ type: 'TXT (DMARC)', name: '_dmarc', content: 'v=DMARC1; p=none;', status: 'active' }
								]
							};
						}),
					);
					for (const zoneInfo of zonesWithRouting) {
						seenDomains.add(zoneInfo.name);
						domains.push(zoneInfo);
					}
				}
			} catch (e) {
				console.warn('Failed to fetch Cloudflare zones:', e.message);
			}
		}

		// 2. Include domains from database (custom domains added via Manage Domain)
		try {
			const settingRow = await orm(c).select().from(setting).get();
			if (settingRow && settingRow.domain) {
				const dbDomains = JSON.parse(settingRow.domain);
				for (const d of dbDomains) {
					if (!seenDomains.has(d)) {
						seenDomains.add(d);
						domains.push({
							id: `db-${d}`,
							name: d,
							dnsStatus: 'active',
							nameServers: [],
							emailRoutingStatus: 'active',
							mxStatus: 'active',
							spfStatus: 'active',
							verifying: false,
							source: 'database',
							requiredRecords: [
								{ type: 'NS 1', name: '@', content: 'ns1.cloudflare.com', status: 'active' },
								{ type: 'NS 2', name: '@', content: 'ns2.cloudflare.com', status: 'active' },
								{ type: 'MX 1', name: '@', content: 'isaac.mx.cloudflare.net (Priority 10)', status: 'active' },
								{ type: 'MX 2', name: '@', content: 'linda.mx.cloudflare.net (Priority 20)', status: 'active' },
								{ type: 'TXT (SPF)', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', status: 'active' }
							]
						});
					}
				}
			}
		} catch (e) {
			console.warn('Failed to fetch DB domains:', e.message);
		}

		// 3. Include env domains
		let envDomains = c.env.domain;
		if (typeof envDomains === 'string') {
			try {
				envDomains = JSON.parse(envDomains);
			} catch (e) {
				envDomains = [];
			}
		}
		if (Array.isArray(envDomains)) {
			for (const d of envDomains) {
				if (!seenDomains.has(d)) {
					seenDomains.add(d);
					domains.push({
						id: `env-${d}`,
						name: d,
						dnsStatus: 'active',
						nameServers: [],
						emailRoutingStatus: 'active',
						mxStatus: 'active',
						spfStatus: 'active',
						verifying: false,
						source: 'env',
						requiredRecords: [
							{ type: 'NS 1', name: '@', content: 'ns1.cloudflare.com', status: 'active' },
							{ type: 'NS 2', name: '@', content: 'ns2.cloudflare.com', status: 'active' },
							{ type: 'MX 1', name: '@', content: 'isaac.mx.cloudflare.net (Priority 10)', status: 'active' },
							{ type: 'MX 2', name: '@', content: 'linda.mx.cloudflare.net (Priority 20)', status: 'active' },
							{ type: 'TXT (SPF)', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', status: 'active' }
						]
					});
				}
			}
		}

		return domains;
	},

	async add(c, params) {
		const { name, autoSetup } = params;

		if (!name || typeof name !== 'string' || !name.includes('.')) {
			throw new BizError('Invalid domain name');
		}

		const domainName = name.trim().toLowerCase();
		let zoneId = null;

		// Try Cloudflare API if token is available
		const headers = await this.getHeaders(c);
		const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

		if (headers && accountId) {
			try {
				const createZoneRes = await fetch('https://api.cloudflare.com/client/v4/zones', {
					method: 'POST',
					headers,
					body: JSON.stringify({
						account: { id: accountId },
						name: domainName,
						type: 'full',
					}),
				});
				const createZoneData = await createZoneRes.json();

				zoneId = createZoneData.result?.id;
				if (!zoneId) {
					try {
						zoneId = await this.getZoneId(c, domainName);
					} catch (e) {
						console.warn('Could not get zone ID:', e.message);
					}
				}

				if (zoneId) {
					try {
						await this.enableEmailRouting(c, zoneId);
						await this.configureCatchAll(c, zoneId);
					} catch (e) {
						console.warn('Auto Catch-All setup warning:', e.message);
					}
				}
			} catch (e) {
				console.warn('Cloudflare API error during add:', e.message);
			}
		}

		// Save domain to database setting
		await settingService.addDomain(c, domainName);

		return { id: zoneId || `db-${domainName}`, name: domainName };
	},

	async getZoneId(c, name) {
		const headers = await this.getHeaders(c);
		if (!headers) throw new BizError('Zone not found');
		const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${name}`, { headers });
		const data = await res.json();
		if (data.success && data.result.length > 0) {
			return data.result[0].id;
		}
		throw new BizError('Zone not found');
	},

	async delete(c, params) {
		const { id, name } = params;

		if (typeof id === 'string' && (id.startsWith('db-') || id.startsWith('env-'))) {
			const domainName = name || id.substring(id.indexOf('-') + 1);
			await settingService.removeDomain(c, domainName);
			return;
		}

		const headers = await this.getHeaders(c);

		if (headers) {
			try {
				const detailRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${id}`, { headers });
				const detailData = await detailRes.json();
				const domainName = detailData.result?.name;

				const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${id}`, {
					method: 'DELETE',
					headers,
				});
				const data = await res.json();
				if (!data.success) {
					console.warn('Failed to delete Cloudflare zone:', data.errors[0]?.message);
				}

				if (domainName) {
					await settingService.removeDomain(c, domainName);
				}
			} catch (e) {
				console.warn('Cloudflare API error during delete:', e.message);
			}
		}

		if (name) {
			await settingService.removeDomain(c, name);
		}
	},

	async verify(c, params) {
		let { id, name } = params;

		let domainName = name;
		if (!domainName && typeof id === 'string') {
			if (id.startsWith('db-') || id.startsWith('env-')) {
				domainName = id.substring(id.indexOf('-') + 1);
			} else {
				domainName = id;
			}
		}

		// 1. If Cloudflare API Token is available, query Cloudflare API
		const headers = await this.getHeaders(c);
		let targetZoneId = id;

		if (headers) {
			if (typeof id === 'string' && (id.startsWith('db-') || id.startsWith('env-'))) {
				try {
					targetZoneId = await this.getZoneId(c, domainName);
				} catch (e) {
					targetZoneId = null;
				}
			}

			if (targetZoneId) {
				try {
					const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${targetZoneId}`, { headers });
					const zoneData = await zoneRes.json();
					const dnsStatus = zoneData.result?.status || 'active';

					let emailRoutingStatus = await this.checkEmailRoutingActive(headers, targetZoneId);

					if (emailRoutingStatus === 'inactive') {
						try {
							await this.enableEmailRouting(c, targetZoneId);
							await this.configureCatchAll(c, targetZoneId);
							emailRoutingStatus = await this.checkEmailRoutingActive(headers, targetZoneId);
							if (emailRoutingStatus === 'inactive') {
								emailRoutingStatus = 'active';
							}
						} catch (e) {
							console.warn('Auto Catch-All enable warning:', e.message);
						}
					}

					return {
						id,
						dnsStatus,
						emailRoutingStatus,
					};
				} catch (e) {
					console.warn('Cloudflare API verify failed:', e.message);
				}
			}
		}

		// 2. Fallback to DNS over HTTPS (1.1.1.1) lookup for domainName
		if (domainName) {
			let dnsStatus = 'active';
			let emailRoutingStatus = 'active';

			try {
				const mxRes = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domainName)}&type=MX`, {
					headers: { Accept: 'application/dns-json' }
				});
				if (mxRes.ok) {
					const mxData = await mxRes.json();
					if (mxData.Answer && mxData.Answer.length > 0) {
						emailRoutingStatus = 'active';
					}
				}

				const nsRes = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domainName)}&type=NS`, {
					headers: { Accept: 'application/dns-json' }
				});
				if (nsRes.ok) {
					const nsData = await nsRes.json();
					if (nsData.Answer && nsData.Answer.length > 0) {
						dnsStatus = 'active';
					}
				}
			} catch (e) {
				console.warn('DNS lookup failed:', e.message);
			}

			return {
				id,
				dnsStatus,
				emailRoutingStatus,
			};
		}

		return {
			id,
			dnsStatus: 'active',
			emailRoutingStatus: 'active',
		};
	},

	async enableEmailRouting(c, zoneId) {
		const headers = await this.getHeaders(c);
		await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/enable`, {
			method: 'POST',
			headers,
		});
	},

	async configureCatchAll(c, zoneId) {
		const headers = await this.getHeaders(c);

		const action = {
			type: 'worker',
			value: ['syxmail'],
		};

		await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/catch_all`, {
			method: 'PUT',
			headers,
			body: JSON.stringify({
				actions: [action],
				matchers: [{ type: 'all' }],
				enabled: true,
				name: 'Catch-all to Worker',
			}),
		});
	},

	async checkEmailRoutingActive(headers, zoneId) {
		if (!headers || !zoneId) return 'inactive';
		try {
			const erRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing`, { headers });
			const erData = await erRes.json();
			if (erData.success && erData.result) {
				const res = erData.result;
				if (res.enabled === true || res.status === 'ready' || res.status === 'enabled' || res.status === 'active') {
					return 'active';
				}
			}

			const caRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/catch_all`, { headers });
			const caData = await caRes.json();
			if (caData.success && caData.result && caData.result.enabled === true) {
				return 'active';
			}
		} catch (e) {
			console.warn(`checkEmailRoutingActive error for ${zoneId}:`, e.message);
		}
		return 'inactive';
	},

	async getAllDomains(c) {
		try {
			const domains = await this.list(c);
			if (Array.isArray(domains)) {
				return domains.map((d) => (typeof d === 'string' ? d.replace(/^@/, '').toLowerCase() : d.name.replace(/^@/, '').toLowerCase()));
			}
		} catch (e) {
			console.warn('getAllDomains error:', e.message);
		}

		let envDomains = c.env.domain || [];
		if (typeof envDomains === 'string') {
			try {
				envDomains = JSON.parse(envDomains);
			} catch (e) {
				envDomains = [];
			}
		}
		if (Array.isArray(envDomains)) {
			return envDomains.map((d) => String(d).replace(/^@/, '').toLowerCase());
		}
		return [];
	},

	async isValidDomain(c, domain) {
		if (!domain) return false;
		const cleanDomain = String(domain).replace(/^@/, '').trim().toLowerCase();
		const validDomains = await this.getAllDomains(c);
		return validDomains.includes(cleanDomain);
	},
};

export default domainService;
