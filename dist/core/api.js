"use strict";
// Edgegap API calls the plugin makes, mirroring the Unity and Godot plugins:
// https://github.com/edgegap/buildtool-unity-plugin, https://github.com/edgegap/buildtool-godot-plugin
// Uses the editor's built-in fetch (Cocos Creator 3.8 runs Electron 31 / Node 20), so no dependencies.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdgegapApi = exports.NotQuickStartTokenError = exports.EdgegapApiError = exports.API_BASE = void 0;
exports.manualRegistry = manualRegistry;
exports.connectionUrl = connectionUrl;
exports.API_BASE = 'https://api.edgegap.com';
class EdgegapApiError extends Error {
    status;
    body;
    constructor(status, body, what) {
        super(`${what}: HTTP ${status} ${body.slice(0, 300)}`);
        this.status = status;
        this.body = body;
    }
}
exports.EdgegapApiError = EdgegapApiError;
/** A valid API token that isn't a quick-start token: it can't read the registry login. */
class NotQuickStartTokenError extends Error {
    constructor() {
        super('Token is valid, but it is not a quick-start token, so Edgegap does not hand it the registry login. ' +
            'Copy Project, Username and Token from the dashboard\'s Container Registry page, or sign in with the one-click link.');
    }
}
exports.NotQuickStartTokenError = NotQuickStartTokenError;
/** Login for registry.edgegap.com as shown on the dashboard's Container Registry page. */
function manualRegistry(project, username, token) {
    return { registryUrl: 'registry.edgegap.com', project: project.trim(), username: username.trim(), token: token.trim() };
}
class EdgegapApi {
    auth;
    // Accepts the token as the dashboard shows it ("token <uuid>") or the bare UUID.
    constructor(token) {
        const t = token.trim();
        this.auth = t.toLowerCase().startsWith('token ') ? t : `token ${t}`;
    }
    async request(method, path, body, what = `${method} ${path}`) {
        const res = await fetch(exports.API_BASE + path, {
            method,
            headers: {
                Authorization: this.auth,
                Accept: 'application/json',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        if (!res.ok)
            throw new EdgegapApiError(res.status, text, what);
        return text ? JSON.parse(text) : {};
    }
    /**
     * Checks the token and returns the push login for this organization's registry.edgegap.com project.
     * Only a quick-start token (the one-click sign-in link, as in the Unity and Godot plugins) gets the
     * registry login; a regular API token throws NotQuickStartTokenError, and the developer copies the
     * login from the dashboard's Container Registry page instead.
     */
    async verifyAndGetRegistry() {
        try {
            await this.request('POST', '/v1/wizard/init-quick-start', { source: 'unity' }, 'Token check');
        }
        catch (e) {
            if (e instanceof EdgegapApiError && e.status === 403 && /quick start/i.test(e.body)) {
                await this.verifyToken();
                throw new NotQuickStartTokenError();
            }
            throw e;
        }
        const c = await this.request('GET', '/v1/wizard/registry-credentials', undefined, 'Registry credentials');
        const creds = {
            registryUrl: String(c.registry_url || 'registry.edgegap.com').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
            project: String(c.project || ''),
            username: String(c.username || ''),
            token: String(c.token || c.password || ''),
        };
        if (!creds.project || !creds.username || !creds.token) {
            throw new Error('Edgegap returned incomplete registry credentials. Sign out and sign in again.');
        }
        return creds;
    }
    /** Any valid API token passes; throws EdgegapApiError (401) otherwise. */
    async verifyToken() {
        await this.request('GET', '/v1/apps?limit=1', undefined, 'Token check');
    }
    async listApps() {
        const r = await this.request('GET', '/v1/apps?limit=100');
        return (r.applications || []).map((a) => String(a.name)).filter(Boolean);
    }
    /** Creates the application, or does nothing if it already exists. */
    async ensureApp(name) {
        try {
            // The API requires "image" (an app icon URL); empty is accepted.
            await this.request('POST', '/v1/app', { name, is_active: true, image: '' }, `Create application ${name}`);
            return 'created';
        }
        catch (e) {
            if (e instanceof EdgegapApiError && e.status === 409)
                return 'exists';
            throw e;
        }
    }
    /** Creates the version; if one with that name exists, points it at the new image instead. */
    async upsertVersion(v) {
        const body = {
            name: v.name,
            docker_repository: v.registry.registryUrl,
            docker_image: v.image,
            docker_tag: v.tag,
            private_username: v.registry.username,
            private_token: v.registry.token,
            req_cpu: v.cpuUnits,
            req_memory: v.memoryMb,
            max_duration: v.maxDurationMinutes,
            time_to_deploy: 120,
            ports: [{
                    name: v.port.name,
                    port: v.port.port,
                    protocol: v.port.protocol,
                    to_check: true,
                    tls_upgrade: v.port.tlsUpgrade,
                }],
        };
        const path = `/v1/app/${encodeURIComponent(v.app)}/version`;
        try {
            await this.request('POST', path, body, `Create version ${v.app}/${v.name}`);
            return 'created';
        }
        catch (e) {
            if (!(e instanceof EdgegapApiError && e.status === 409))
                throw e;
            await this.request('PATCH', `${path}/${encodeURIComponent(v.name)}`, body, `Update version ${v.app}/${v.name}`);
            return 'updated';
        }
    }
    async publicIp() {
        const r = await this.request('GET', '/v1/ip');
        return String(r.public_ip || '');
    }
    /** Starts one server near the given player IPs. Returns the request ID. */
    async deploy(app, version, ips, tags) {
        const r = await this.request('POST', '/v2/deployments', {
            application: app,
            version,
            users: ips.map((ip) => ({ user_type: 'ip_address', user_data: { ip_address: ip } })),
            tags,
        }, `Deploy ${app}/${version}`);
        return String(r.request_id);
    }
    async status(requestId) {
        const r = await this.request('GET', `/v1/status/${encodeURIComponent(requestId)}`);
        const status = String(r.current_status || '');
        return {
            requestId,
            status,
            ready: status === 'Status.READY',
            error: status === 'Status.ERROR' || !!r.error,
            fqdn: String(r.fqdn || ''),
            publicIp: String(r.public_ip || ''),
            ports: r.ports || {},
            message: String(r.error_detail || r.error || ''),
        };
    }
    async stop(requestId) {
        try {
            await this.request('DELETE', `/v1/stop/${encodeURIComponent(requestId)}`, undefined, `Stop ${requestId}`);
        }
        catch (e) {
            // 404/410: already gone (it stopped itself or reached its max duration).
            if (e instanceof EdgegapApiError && (e.status === 404 || e.status === 410))
                return;
            throw e;
        }
    }
}
exports.EdgegapApi = EdgegapApi;
/** The address clients connect to: wss://<fqdn>:<external> when TLS Upgrade is on, else the plain scheme. */
function connectionUrl(s, portName) {
    const p = s.ports[portName];
    if (!p || !s.fqdn)
        return '';
    // The status API names a WS port "WEBSOCKET" (the version API takes "WS").
    const proto = String(p.protocol || '').toUpperCase();
    if (proto === 'WS' || proto === 'WSS' || proto === 'WEBSOCKET')
        return `${p.tls_upgrade || proto === 'WSS' ? 'wss' : 'ws'}://${s.fqdn}:${p.external}`;
    if (proto === 'HTTP' || proto === 'HTTPS')
        return `${p.tls_upgrade || proto === 'HTTPS' ? 'https' : 'http'}://${s.fqdn}:${p.external}`;
    return `${s.fqdn}:${p.external} (${proto})`;
}
