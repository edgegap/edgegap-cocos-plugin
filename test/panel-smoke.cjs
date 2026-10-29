// Loads the compiled panel with a stubbed Cocos `Editor` and stub elements, runs ready() and a few
// buttons that need no network. Catches load-time and wiring errors outside the editor.
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs');

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'egcocos-'));
fs.mkdirSync(path.join(project, 'Server'));
const profiles = { global: {}, local: {}, project: {} };
global.Editor = {
    Panel: { define: (o) => o, open: async () => {} },
    Profile: {
        getConfig: async (_p, k, t) => profiles[t || 'default']?.[k],
        setConfig: async (_p, k, v, t) => { profiles[t || 'default'][k] = v; },
        getProject: async (_p, k) => profiles.project[k],
        setProject: async (_p, k, v) => { profiles.project[k] = v; },
    },
    Project: { path: project, name: 'Smoke Test' },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
    if (req === 'electron') return { shell: { openExternal: async () => {} } };
    return origLoad.call(this, req, ...rest);
};

class El {
    constructor(id) { this.id = id; this.value = ''; this.innerText = ''; this.innerHTML = ''; this.listeners = {}; this.attrs = new Set(); this.cls = new Set(); }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    fire(e) { return Promise.all((this.listeners[e] || []).map((f) => f())); }
    toggleAttribute(a, on) { on ? this.attrs.add(a) : this.attrs.delete(a); }
    get classList() { const c = this.cls; return { toggle: (n, on) => (on ? c.add(n) : c.delete(n)), remove: (n) => c.delete(n), add: (n) => c.add(n) }; }
}

(async () => {
    const panel = require(path.join(__dirname, '../dist/panels/default/index.js'));
    if (!panel.template.includes('btn-deploy') || !panel.style.includes('#ta-log')) throw new Error('template/style not loaded');
    const $ = Object.fromEntries(Object.keys(panel.$).map((k) => [k, new El(k)]));
    const self = { $ };
    for (const [k, f] of Object.entries(panel.methods)) self[k] = f.bind(self);
    await panel.ready.call(self);
    const tick = () => new Promise((r) => setTimeout(r, 50));
    const assert = (c, m) => { if (!c) throw new Error(m); };

    assert($.inpImage.value === 'smoke-test-server', `default image name: ${$.inpImage.value}`);
    assert(/^\d{8}-\d{4}$/.test($.inpTag.value), `default tag: ${$.inpTag.value}`);
    assert($.btnBuild.attrs.has('disabled'), 'build disabled before sign-in');
    assert(!$.signedOut.cls.has('hidden') && $.signedIn.cls.has('hidden'), 'signed-out view shown');
    assert($.lblDockerfile.innerText.startsWith('No Dockerfile'), `dockerfile label: ${$.lblDockerfile.innerText}`);

    await $.btnDockerfile.fire('confirm'); await tick();
    assert(fs.existsSync(path.join(project, 'Server/Dockerfile')), 'Create Dockerfile wrote the file');
    assert(fs.readFileSync(path.join(project, 'Server/Dockerfile'), 'utf8').includes('EXPOSE 2567/tcp'), 'Dockerfile port');
    assert($.btnDockerfile.attrs.has('disabled'), 'Create Dockerfile disabled once it exists');

    $.inpPort.value = 3000; await $.inpPort.fire('change'); await tick();
    assert(profiles.project.server.port.port === 3000, 'port saved to project settings');

    await $.btnSignIn.fire('confirm'); await tick();
    assert($.taLog.value.includes('Paste your API token first'), 'empty token refused');
    assert(!JSON.stringify(profiles.project).includes('token'), 'no token in project settings');
    console.log('panel smoke: ok');
    fs.rmSync(project, { recursive: true, force: true });
})().catch((e) => { console.error('panel smoke: FAIL', e); process.exit(1); });
