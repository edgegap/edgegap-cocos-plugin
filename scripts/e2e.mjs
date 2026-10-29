#!/usr/bin/env node
// Runs the panel's steps headless, with the same code (dist/core), for CI and for testing the plugin
// without clicking through the editor. Reads the project's plugin settings like the panel does.
//
//   EDGEGAP_API_TOKEN=<token> node scripts/e2e.mjs --project <cocos project> [--deploy] [--check "<cmd> {url}"]
//
// A quick-start token gets the registry login from Edgegap. With a regular API token, also set
// EDGEGAP_REGISTRY_PROJECT, EDGEGAP_REGISTRY_USERNAME and EDGEGAP_REGISTRY_TOKEN (dashboard: Container Registry).
//
//   --deploy   after the upload, start one test server near you and print its URL
//   --check    a command to run against the server URL ({url} is replaced), e.g. a bot client;
//              the test server is stopped afterwards either way
//
// The token is read from the environment only and is never printed.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(import.meta.url), '../..');
const { EdgegapApi, NotQuickStartTokenError, manualRegistry } = require(join(root, 'dist/core/api.js'));
const wf = require(join(root, 'dist/core/workflow.js'));

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (n) => process.argv.includes(`--${n}`);
const project = resolve(arg('project') || '.');
const token = process.env.EDGEGAP_API_TOKEN;
if (!token) { console.error('Set EDGEGAP_API_TOKEN.'); process.exit(2); }

const saved = wf.readJson(join(project, 'settings/v2/packages/edgegap-extension.json'), {}).server || {};
const cfg = { ...wf.defaultConfig(basename(project)), ...saved, port: { ...wf.DEFAULT_PORT, ...(saved.port || {}) } };
cfg.tag = arg('tag') || wf.timestampTag();
const log = (l) => console.log(l);

const problems = wf.validate(project, cfg);
if (problems.length) { problems.forEach((p) => console.error(`! ${p}`)); process.exit(1); }

const api = new EdgegapApi(token);
log('== 1. Sign in');
let reg;
try {
    reg = await api.verifyAndGetRegistry();
} catch (e) {
    if (!(e instanceof NotQuickStartTokenError)) throw e;
    const env = process.env;
    if (!env.EDGEGAP_REGISTRY_PROJECT || !env.EDGEGAP_REGISTRY_USERNAME || !env.EDGEGAP_REGISTRY_TOKEN) {
        console.error(e.message + ' Set EDGEGAP_REGISTRY_PROJECT, EDGEGAP_REGISTRY_USERNAME and EDGEGAP_REGISTRY_TOKEN.');
        process.exit(2);
    }
    log('regular API token: using the registry login from the environment');
    reg = manualRegistry(env.EDGEGAP_REGISTRY_PROJECT, env.EDGEGAP_REGISTRY_USERNAME, env.EDGEGAP_REGISTRY_TOKEN);
}
log(`registry ${reg.registryUrl}/${reg.project}`);

log('== 2-3. Build and test locally');
await wf.buildImage(project, cfg, reg, log);
const localUrl = await wf.testLocally(cfg, reg, log);
let localOk = false;
for (let i = 0; i < 15 && !localOk; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { await fetch(localUrl.replace(/^ws/, 'http')); localOk = true; } catch {}
}
await wf.stopLocalTest(cfg, log);
if (!localOk) { console.error(`Local container never answered on ${localUrl}`); process.exit(1); }
log(`local container answered on ${localUrl}`);

log('== 4. Upload');
await wf.upload(api, cfg, reg, log);

if (flag('deploy')) {
    log('== 5. Deploy');
    let id = '';
    let code = 0;
    try {
        const { url } = await wf.deployAndWait(api, cfg, log, (rid) => { id = rid; });
        const check = arg('check');
        if (check) {
            const cmd = check.replaceAll('{url}', url);
            log(`$ ${cmd}`);
            try { execSync(cmd, { stdio: 'inherit', shell: true }); } catch (e) { code = 1; }
        }
    } finally {
        if (id) { await api.stop(id); log(`stopped ${id}`); }
    }
    process.exit(code);
}
log(`PASS: ${cfg.app}/${cfg.tag}`);
