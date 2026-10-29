"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Edgegap panel: sign in, build the server image, test it locally, upload it, deploy a test server.
//
// Where settings live:
//   - API token and registry login: the Cocos Creator user profile ('global'), never the project folder.
//   - Server settings (folder, image, port...): the project (settings/v2/packages/edgegap-extension.json),
//     so a team or a sample repo shares them.
//   - Last test deployment: project-local profile ('local', git-ignored).
const fs_1 = require("fs");
const path_1 = require("path");
const electron_1 = require("electron");
const api_1 = require("../../core/api");
const wf = __importStar(require("../../core/workflow"));
const PKG = 'edgegap-extension';
const UTM = 'utm_source=plugin_cocos&utm_medium=servers_quickstart_plugin&utm_content=plugin_button';
// One-click sign-in, as in the Unity and Godot plugins: it shows a quick-start token, which also gets the registry login.
const TOKEN_URL = `https://app.edgegap.com/?oneClick=true&${UTM}`;
const DASHBOARD_URL = `https://app.edgegap.com/?${UTM}`;
let token = '';
let pendingToken = ''; // a valid regular API token waiting for a manual registry login
let registry = null;
let cfg;
let deploymentId = '';
let busy = false;
async function getGlobal(key, fallback) {
    const v = await Editor.Profile.getConfig(PKG, key, 'global');
    return (v === undefined || v === null || v === '') ? fallback : v;
}
async function setGlobal(key, value) {
    await Editor.Profile.setConfig(PKG, key, value, 'global');
}
module.exports = Editor.Panel.define({
    template: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        signedOut: '#signed-out', signedIn: '#signed-in', lblAccount: '#lbl-account',
        inpToken: '#inp-token', btnSignIn: '#btn-sign-in', btnSignOut: '#btn-sign-out', linkToken: '#link-token',
        registryManual: '#registry-manual', inpRegProject: '#inp-reg-project', inpRegUser: '#inp-reg-user',
        inpRegToken: '#inp-reg-token', btnRegSave: '#btn-reg-save', linkRegistry: '#link-registry',
        inpServerDir: '#inp-server-dir', lblDockerfile: '#lbl-dockerfile', btnDockerfile: '#btn-dockerfile',
        inpImage: '#inp-image', inpTag: '#inp-tag', btnNewTag: '#btn-new-tag',
        inpPort: '#inp-port', selProtocol: '#sel-protocol', chkTls: '#chk-tls', inpPortName: '#inp-port-name',
        btnBuild: '#btn-build', btnRunLocal: '#btn-run-local', btnStopLocal: '#btn-stop-local', lblLocal: '#lbl-local',
        inpApp: '#inp-app', btnRefreshApps: '#btn-refresh-apps', propApps: '#prop-apps', selApps: '#sel-apps',
        inpCpu: '#inp-cpu', inpMem: '#inp-mem', inpDuration: '#inp-duration', btnUpload: '#btn-upload',
        btnDeploy: '#btn-deploy', btnStop: '#btn-stop', lblDeploy: '#lbl-deploy', inpUrl: '#inp-url',
        taLog: '#ta-log',
    },
    // `this` is the panel instance: this.$ holds the elements above, methods call each other.
    methods: {
        log(line) {
            const ta = this.$.taLog;
            const stamp = new Date().toISOString().slice(11, 19);
            ta.value = (ta.value ? ta.value + '\n' : '') + `[${stamp}] ${line}`;
            const inner = ta.shadowRoot?.querySelector('textarea');
            if (inner)
                inner.scrollTop = inner.scrollHeight;
        },
        // Reads the form into cfg and saves it in the project.
        async readForm() {
            const $ = this.$;
            cfg = {
                serverDir: String($.inpServerDir.value || 'Server').trim(),
                imageName: String($.inpImage.value || cfg.imageName).trim(),
                tag: String($.inpTag.value || wf.timestampTag()).trim(),
                app: String($.inpApp.value || cfg.app).trim(),
                port: {
                    name: String($.inpPortName.value || 'gameport').trim(),
                    port: Number($.inpPort.value) || 2567,
                    protocol: $.selProtocol.value || 'WS',
                    tlsUpgrade: !!$.chkTls.value,
                },
                cpuUnits: Number($.inpCpu.value) || 256,
                memoryMb: Number($.inpMem.value) || 512,
                maxDurationMinutes: Number($.inpDuration.value) || 60,
            };
            await Editor.Profile.setProject(PKG, 'server', cfg);
            this.refreshDockerfile();
        },
        writeForm() {
            const $ = this.$;
            $.inpServerDir.value = cfg.serverDir;
            $.inpImage.value = cfg.imageName;
            $.inpTag.value = cfg.tag;
            $.inpPort.value = cfg.port.port;
            $.selProtocol.value = cfg.port.protocol;
            $.chkTls.value = cfg.port.tlsUpgrade;
            $.inpPortName.value = cfg.port.name;
            $.inpApp.value = cfg.app;
            $.inpCpu.value = cfg.cpuUnits;
            $.inpMem.value = cfg.memoryMb;
            $.inpDuration.value = cfg.maxDurationMinutes;
        },
        refreshDockerfile() {
            const dir = wf.serverPath(Editor.Project.path, cfg);
            const has = (0, fs_1.existsSync)((0, path_1.join)(dir, 'Dockerfile'));
            this.$.lblDockerfile.innerText = !(0, fs_1.existsSync)(dir) ? `Folder not found: ${cfg.serverDir}`
                : has ? `Dockerfile found in ${cfg.serverDir}` : `No Dockerfile in ${cfg.serverDir}`;
            this.$.btnDockerfile.toggleAttribute('disabled', has || !(0, fs_1.existsSync)(dir));
        },
        refreshAuth() {
            const signedIn = !!token && !!registry;
            this.$.signedOut.classList.toggle('hidden', signedIn);
            this.$.signedIn.classList.toggle('hidden', !signedIn);
            if (registry)
                this.$.lblAccount.innerText = `Signed in. Registry: ${registry.registryUrl}/${registry.project}`;
            for (const b of ['btnBuild', 'btnRunLocal', 'btnUpload', 'btnDeploy', 'btnRefreshApps']) {
                this.$[b].toggleAttribute('disabled', !signedIn || busy);
            }
            this.$.btnStop.toggleAttribute('disabled', !deploymentId || busy);
        },
        // Runs one step: locks the buttons, logs errors instead of throwing.
        async step(name, fn) {
            if (busy)
                return;
            busy = true;
            this.refreshAuth();
            try {
                await this.readForm();
                await fn();
            }
            catch (e) {
                this.log(`${name} failed: ${e?.message || e}`);
                console.error(e);
            }
            finally {
                busy = false;
                this.refreshAuth();
            }
        },
        problems() {
            const p = wf.validate(Editor.Project.path, cfg);
            p.forEach((x) => this.log(`! ${x}`));
            return p.length > 0;
        },
        async signIn() {
            const t = String(this.$.inpToken.value || '').trim();
            if (!t) {
                this.log('Paste your API token first.');
                return;
            }
            await this.step('Sign in', async () => {
                this.log('Verifying token...');
                try {
                    registry = await new api_1.EdgegapApi(t).verifyAndGetRegistry();
                }
                catch (e) {
                    if (!(e instanceof api_1.NotQuickStartTokenError))
                        throw e;
                    pendingToken = t;
                    this.$.inpToken.value = '';
                    this.$.registryManual.classList.remove('hidden');
                    this.log(e.message);
                    return;
                }
                token = t;
                await setGlobal('token', token);
                await setGlobal('registry', registry);
                this.$.inpToken.value = '';
                this.log(`Signed in. Registry ${registry.registryUrl}/${registry.project}`);
            });
        },
        // Regular API token: the developer pastes the registry login from the dashboard.
        async useManualRegistry() {
            const $ = this.$;
            const reg = (0, api_1.manualRegistry)(String($.inpRegProject.value || ''), String($.inpRegUser.value || ''), String($.inpRegToken.value || ''));
            if (!pendingToken) {
                this.log('Verify your API token first.');
                return;
            }
            if (!reg.project || !reg.username || !reg.token) {
                this.log('Fill in Project, Username and Registry token.');
                return;
            }
            token = pendingToken;
            pendingToken = '';
            registry = reg;
            await setGlobal('token', token);
            await setGlobal('registry', registry);
            $.inpRegToken.value = '';
            this.$.registryManual.classList.add('hidden');
            this.log(`Signed in. Registry ${reg.registryUrl}/${reg.project}`);
            this.refreshAuth();
        },
        async signOut() {
            token = '';
            registry = null;
            await setGlobal('token', '');
            await setGlobal('registry', null);
            this.log('Signed out.');
            this.refreshAuth();
        },
        async createDockerfile() {
            await this.step('Create Dockerfile', async () => {
                const file = wf.writeDockerfileIfMissing(Editor.Project.path, cfg);
                this.log(file ? `Wrote ${file}. Check its CMD starts your server.` : 'A Dockerfile already exists.');
                this.refreshDockerfile();
            });
        },
        async build() {
            await this.step('Build', async () => {
                if (this.problems())
                    return;
                await wf.buildImage(Editor.Project.path, cfg, registry, (l) => this.log(l));
            });
        },
        async runLocal() {
            await this.step('Run locally', async () => {
                const url = await wf.testLocally(cfg, registry, (l) => this.log(l));
                this.$.lblLocal.innerText = `Running: ${url}`;
            });
        },
        async stopLocal() {
            await this.step('Stop local', async () => {
                await wf.stopLocalTest(cfg, (l) => this.log(l));
                this.$.lblLocal.innerText = 'Not running.';
            });
        },
        async pickApps() {
            await this.step('List applications', async () => {
                const apps = await new api_1.EdgegapApi(token).listApps();
                const sel = this.$.selApps;
                sel.innerHTML = ['<option value="">(choose)</option>', ...apps.map((a) => `<option value="${a.replace(/"/g, '')}">${a.replace(/</g, '')}</option>`)].join('');
                this.$.propApps.classList.remove('hidden');
                this.log(`${apps.length} application(s).`);
            });
        },
        async upload() {
            await this.step('Upload', async () => {
                if (this.problems())
                    return;
                await wf.upload(new api_1.EdgegapApi(token), cfg, registry, (l) => this.log(l));
            });
        },
        async deploy() {
            await this.step('Deploy', async () => {
                if (deploymentId)
                    this.log(`Note: test server ${deploymentId} may still be running; stop it if you're done with it.`);
                this.$.lblDeploy.innerText = 'Starting...';
                const { status, url } = await wf.deployAndWait(new api_1.EdgegapApi(token), cfg, (l) => this.log(l), async (id) => {
                    deploymentId = id;
                    await Editor.Profile.setConfig(PKG, 'lastDeployment', id, 'local');
                });
                this.$.lblDeploy.innerText = `Ready: ${status.requestId} (stops after ${cfg.maxDurationMinutes} min at most)`;
                this.$.inpUrl.value = url;
            });
        },
        async stopDeployment() {
            if (!deploymentId)
                return;
            await this.step('Stop', async () => {
                await new api_1.EdgegapApi(token).stop(deploymentId);
                this.log(`Stopping ${deploymentId}.`);
                deploymentId = '';
                await Editor.Profile.setConfig(PKG, 'lastDeployment', '', 'local');
                this.$.lblDeploy.innerText = 'No test server.';
                this.$.inpUrl.value = '';
            });
        },
    },
    async ready() {
        const $ = this.$;
        token = await getGlobal('token', '');
        registry = await getGlobal('registry', null);
        const saved = await Editor.Profile.getProject(PKG, 'server');
        cfg = { ...wf.defaultConfig(Editor.Project.name || 'cocos-game'), ...(saved || {}) };
        cfg.port = { ...wf.DEFAULT_PORT, ...(saved?.port || {}) };
        deploymentId = await Editor.Profile.getConfig(PKG, 'lastDeployment', 'local') || '';
        this.writeForm();
        this.refreshDockerfile();
        this.refreshAuth();
        if (deploymentId)
            this.$.lblDeploy.innerText = `Last test server: ${deploymentId}`;
        $.btnSignIn.addEventListener('confirm', () => this.signIn());
        $.btnSignOut.addEventListener('confirm', () => this.signOut());
        $.linkToken.addEventListener('click', () => electron_1.shell.openExternal(TOKEN_URL));
        $.linkRegistry.addEventListener('click', () => electron_1.shell.openExternal(DASHBOARD_URL));
        $.btnRegSave.addEventListener('confirm', () => this.useManualRegistry());
        $.btnDockerfile.addEventListener('confirm', () => this.createDockerfile());
        $.btnNewTag.addEventListener('confirm', () => { $.inpTag.value = wf.timestampTag(); this.readForm(); });
        $.btnBuild.addEventListener('confirm', () => this.build());
        $.btnRunLocal.addEventListener('confirm', () => this.runLocal());
        $.btnStopLocal.addEventListener('confirm', () => this.stopLocal());
        $.btnRefreshApps.addEventListener('confirm', () => this.pickApps());
        $.selApps.addEventListener('change', () => { if ($.selApps.value) {
            $.inpApp.value = $.selApps.value;
            this.readForm();
        } });
        $.btnUpload.addEventListener('confirm', () => this.upload());
        $.btnDeploy.addEventListener('confirm', () => this.deploy());
        $.btnStop.addEventListener('confirm', () => this.stopDeployment());
        for (const id of ['inpServerDir', 'inpImage', 'inpTag', 'inpPort', 'selProtocol', 'chkTls', 'inpPortName', 'inpApp', 'inpCpu', 'inpMem', 'inpDuration']) {
            $[id].addEventListener('change', () => this.readForm());
        }
        this.log(token ? 'Ready.' : 'Paste your Edgegap API token to start.');
    },
    close() { },
});
