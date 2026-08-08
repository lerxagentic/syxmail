/**
 * SyxMail API Client for Bot / Automation Script / AI Agents
 * 
 * Supports both JWT Token, Public Token, and API Key (X-API-Key / Bearer sk_live_...) authentication.
 * Compatible with SyxMail APIs and Agent / MoeMail APIs.
 * 
 * Requirements: Node.js 18+ (uses native fetch API)
 */

class SyxMailBotClient {
    /**
     * @param {string} baseUrl - Base URL of SyxMail backend (e.g. "https://mail.yourdomain.workers.dev" or "http://localhost:8787")
     * @param {string} [apiKeyOrToken] - Optional API Key (sk_live_...) or JWT Token
     */
    constructor(baseUrl = 'http://localhost:8787', apiKeyOrToken = null) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = apiKeyOrToken;
        this.apiKey = apiKeyOrToken && apiKeyOrToken.startsWith('sk_live_') ? apiKeyOrToken : null;
    }

    /**
     * Internal request helper
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.apiKey) {
            headers['X-API-Key'] = this.apiKey;
        } else if (this.token) {
            headers['Authorization'] = this.token;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok || (data.code !== undefined && data.code !== 200 && data.code !== 0)) {
                throw new Error(data.message || data.msg || `HTTP Error ${response.status}`);
            }

            return data.data !== undefined ? data.data : data;
        } catch (err) {
            console.error(`[SyxMail API Error] ${options.method || 'GET'} ${url}:`, err.message);
            throw err;
        }
    }

    // ==========================================
    // 🔑 AUTHENTICATION & API KEYS
    // ==========================================

    /**
     * Login with user credentials to get JWT token
     */
    async login(email, password) {
        const res = await this._request('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (res.token) {
            this.token = res.token;
        }
        return res;
    }

    /**
     * Set active API Key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.token = apiKey;
    }

    /**
     * Generate a new API Key for current user
     */
    async createApiKey(name) {
        return await this._request('/apiKey/create', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    }

    /**
     * List user's active API keys
     */
    async listApiKeys() {
        return await this._request('/apiKey/list', { method: 'GET' });
    }

    // ==========================================
    // 🤖 AGENT / MOEMAIL COMPATIBLE API
    // ==========================================

    /**
     * Get system configuration (Domains, max emails, user role, etc.)
     */
    async getConfig() {
        return await this._request('/config', { method: 'GET' });
    }

    /**
     * Get current authenticated user role & role permissions info
     */
    async getUserRole() {
        return await this._request('/user/role', { method: 'GET' });
    }

    /**
     * Get list of email domains permitted for current user role
     */
    async getAvailableDomains() {
        return await this._request('/domains', { method: 'GET' });
    }

    /**
     * Generate a temporary mailbox
     * @param {Object} [params] - { name: 'prefix', domain: 'example.com', expiryTime: 3600000 }
     */
    async generateTempEmail(params = {}) {
        return await this._request('/emails/generate', {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    /**
     * Get list of created mailboxes
     */
    async getMailboxes() {
        return await this._request('/emails', { method: 'GET' });
    }

    /**
     * Get messages in a mailbox
     */
    async getMessages(emailId) {
        return await this._request(`/emails/${emailId}`, { method: 'GET' });
    }

    /**
     * Read a single message content
     */
    async readMessage(emailId, messageId) {
        return await this._request(`/emails/${emailId}/${messageId}`, { method: 'GET' });
    }

    /**
     * Realtime Wait for Incoming Verification Email (Long Polling)
     * Auto extracts OTP / verification code & verification link.
     * @param {string|number} emailIdOrAddress - Mailbox ID or Email Address
     * @param {number} [timeoutSec=60] - Timeout in seconds (max 120)
     */
    async waitForEmail(emailIdOrAddress, timeoutSec = 60) {
        const isNum = !isNaN(Number(emailIdOrAddress));
        const endpoint = isNum
            ? `/emails/${emailIdOrAddress}/wait?timeout=${timeoutSec}`
            : `/emails/wait?address=${encodeURIComponent(emailIdOrAddress)}&timeout=${timeoutSec}`;
        return await this._request(endpoint, { method: 'GET' });
    }

    /**
     * Delete/Revoke a mailbox
     */
    async deleteMailbox(emailId) {
        return await this._request(`/emails/${emailId}`, { method: 'DELETE' });
    }

    /**
     * Send email from mailbox
     */
    async sendEmail(emailId, { to, subject, content }) {
        return await this._request(`/emails/${emailId}/send`, {
            method: 'POST',
            body: JSON.stringify({ to, subject, content })
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyxMailBotClient;
}

if (require.main === module) {
    (async () => {
        console.log('--- SyxMail API Client & Agent Demo ---');
        const bot = new SyxMailBotClient('http://localhost:8787');
        try {
            const config = await bot.getConfig();
            console.log('✅ System Config:', config);
        } catch (e) {
            console.error('❌ Error:', e.message);
        }
    })();
}
