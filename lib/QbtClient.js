/**
 * QbtClient
 * Encapsulates qBittorrent Web API interactions.
 */

const {URL, URLSearchParams} = require('node:url');

class QbtClient {
    constructor(baseUrl, username, password, opts = {}) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.cookie = '';
        this.debugEnabled = !!opts.debug;
    }

    debug(...args) {
        if (this.debugEnabled) {
            console.log('[DEBUG]', ...args);
        }
    }

    setCookie(cookie) {
        this.cookie = cookie || '';
    }

    getCookie() {
        return this.cookie || '';
    }

    async login() {
        const loginUrl = new URL('/api/v2/auth/login', this.baseUrl);
        this.debug('Login URL:', loginUrl.toString());
        const res = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': this.cookie || '',
            },
            body: new URLSearchParams({username: this.username, password: this.password}).toString(),
            redirect: 'manual',
        });
        this.debug('Login response:', res.status, res.statusText);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Login failed: HTTP ${res.status} ${res.statusText} - ${text}`);
        }
        // Capture SID cookie
        const setCookie = res.headers.get('set-cookie') || '';
        this.debug('Set-Cookie header present:', !!setCookie);
        let m = /SID=([^;]+);/.exec(setCookie);
        if (!m) {
            // Some versions set "qbittorrent_sess" or reuse cookie on 200.
            const m2 = /(SID|qbittorrent_sess)=([^;]+);/.exec(setCookie);
            if (!m2) {
                // qBittorrent may return 200 with existing cookie. Proceed if already set.
                if (!this.cookie) {
                    throw new Error('Login did not return a session cookie. Check credentials or CSRF settings.');
                }
                this.debug('Proceeding with preexisting cookie.');
            } else {
                this.cookie = `${m2[1]}=${m2[2]}`;
                this.debug('Captured session cookie type:', m2[1]);
            }
        } else {
            this.cookie = `SID=${m[1]}`;
            this.debug('Captured session cookie: SID');
        }
    }

    async getTorrents(filters = {}) {
        const url = new URL('/api/v2/torrents/info', this.baseUrl);
        if (filters.category) url.searchParams.set('category', filters.category);
        if (filters.tag && filters.tag.length) url.searchParams.set('tag', filters.tag.join(','));
        if (filters.hash && filters.hash.length === 1) url.searchParams.set('hashes', filters.hash[0]);
        if (filters.state) url.searchParams.set('filter', filters.state);

        this.debug('Fetching torrents from:', url.toString());
        const res = await fetch(url, {
            headers: {Cookie: this.cookie || ''},
        });
        this.debug('Torrents response:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Failed to fetch torrents: ${res.status} ${res.statusText}`);
        const data = await res.json();
        this.debug('Torrents count:', Array.isArray(data) ? data.length : 'n/a');
        return data;
    }

    async getTrackers(hash) {
        const url = new URL('/api/v2/torrents/trackers', this.baseUrl);
        url.searchParams.set('hash', hash);
        this.debug('Fetching trackers for hash:', hash, 'URL:', url.toString());
        const res = await fetch(url, {headers: {Cookie: this.cookie || ''}});
        this.debug('Trackers response:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Failed to fetch trackers for ${hash}: ${res.status} ${res.statusText}`);
        const data = await res.json();
        this.debug('Trackers count for', hash, ':', Array.isArray(data) ? data.length : 'n/a');
        return data;
    }

    async editTracker(hash, origUrl, newUrl) {
        const url = new URL('/api/v2/torrents/editTracker', this.baseUrl);
        const body = new URLSearchParams({hash, origUrl, newUrl}).toString();
        this.debug('Editing tracker for hash:', hash);
        this.debug('Orig URL:', origUrl);
        this.debug('New URL:', newUrl);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: this.cookie || '',
            },
            body,
        });
        this.debug('Edit tracker response:', res.status, res.statusText);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Failed to edit tracker (hash=${hash}): ${res.status} ${res.statusText} - ${text}`);
        }
    }
}

module.exports = {QbtClient};
