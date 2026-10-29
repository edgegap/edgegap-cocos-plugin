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
exports.DEPLOY_TAG = exports.DEFAULT_PORT = void 0;
exports.defaultConfig = defaultConfig;
exports.timestampTag = timestampTag;
exports.slugify = slugify;
exports.serverPath = serverPath;
exports.imageRef = imageRef;
exports.validate = validate;
exports.nodeDockerfile = nodeDockerfile;
exports.writeDockerfileIfMissing = writeDockerfileIfMissing;
exports.buildImage = buildImage;
exports.localContainerName = localContainerName;
exports.testLocally = testLocally;
exports.stopLocalTest = stopLocalTest;
exports.upload = upload;
exports.deployAndWait = deployAndWait;
exports.readJson = readJson;
// The plugin's steps, independent of the editor UI so scripts/e2e.mjs can run the same code headless.
//
//   1. Sign in        token -> registry login (verifyAndGetRegistry)
//   2. Build image    <serverDir>/Dockerfile -> registry.edgegap.com/<project>/<image>:<tag>
//   3. Test locally   docker run -p <port>:<port>
//   4. Upload         docker push, create the application if needed, create/update the version
//   5. Deploy         one server near you, wait until ready, print the URL; stop it
//
// A Cocos Creator game has no headless server build: its multiplayer server is a separate Node.js app
// (Colyseus, Nakama runtime, a custom WebSocket server...). The plugin containerizes that folder.
const fs_1 = require("fs");
const path_1 = require("path");
const api_1 = require("./api");
const docker = __importStar(require("./docker"));
exports.DEFAULT_PORT = { name: 'gameport', port: 2567, protocol: 'WS', tlsUpgrade: true };
function defaultConfig(projectName) {
    const slug = slugify(projectName) || 'cocos-game';
    return {
        serverDir: 'Server',
        imageName: `${slug}-server`,
        tag: timestampTag(),
        app: slug,
        port: { ...exports.DEFAULT_PORT },
        cpuUnits: 256,
        memoryMb: 512,
        maxDurationMinutes: 60,
    };
}
/** UTC timestamp YYYYMMDD-HHMM: sorts by date and shows how fresh a build is. */
function timestampTag(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
function serverPath(projectDir, cfg) {
    return (0, path_1.isAbsolute)(cfg.serverDir) ? cfg.serverDir : (0, path_1.resolve)(projectDir, cfg.serverDir);
}
function imageRef(reg, cfg) {
    return `${reg.registryUrl}/${reg.project}/${cfg.imageName}:${cfg.tag}`;
}
/** Checks everything the build needs before running Docker. Returns problems as sentences, empty when OK. */
function validate(projectDir, cfg) {
    const problems = [];
    const dir = serverPath(projectDir, cfg);
    if (!(0, fs_1.existsSync)(dir))
        problems.push(`Server folder not found: ${dir}`);
    else if (!(0, fs_1.existsSync)((0, path_1.join)(dir, 'Dockerfile')))
        problems.push(`No Dockerfile in ${dir}. Click "Create Dockerfile" or add your own.`);
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(cfg.imageName))
        problems.push('Image name: lowercase letters, digits, ".", "_" or "-".');
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(cfg.tag) || cfg.tag === 'latest')
        problems.push('Tag: a build ID such as a UTC timestamp, not "latest".');
    if (!cfg.app || cfg.app.length < 3)
        problems.push('Application name: at least 3 characters.');
    if (!(cfg.port.port >= 1 && cfg.port.port <= 59999))
        problems.push('Port: 1 to 59999.');
    if (cfg.port.tlsUpgrade && !['WS', 'HTTP'].includes(cfg.port.protocol))
        problems.push('TLS Upgrade only works on WS and HTTP ports.');
    if (cfg.memoryMb < 256 || cfg.memoryMb > cfg.cpuUnits * 2)
        problems.push('Memory: at least 256 MB and at most 2x the CPU units.');
    return problems;
}
/** A starting Dockerfile for a Node.js game server, written only when the folder has none. */
function nodeDockerfile(port) {
    return `# Edgegap game server image (linux/amd64), made by the Edgegap Cocos plugin. Edit freely.
# Assumes a Node.js server whose package.json "start" script runs it. For TypeScript run with tsx,
# keep tsx in "dependencies" (NODE_ENV=production skips devDependencies).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=${port}
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE ${port}/tcp
USER node
# Prefer the exec form with node itself as PID 1, e.g. CMD ["node", "--import", "tsx", "src/index.ts"]:
# then Edgegap's SIGTERM reaches the server directly when the deployment stops.
CMD ["npm", "start"]
`;
}
function writeDockerfileIfMissing(projectDir, cfg) {
    const dir = serverPath(projectDir, cfg);
    const file = (0, path_1.join)(dir, 'Dockerfile');
    if ((0, fs_1.existsSync)(file))
        return null;
    (0, fs_1.writeFileSync)(file, nodeDockerfile(cfg.port.port));
    const ignore = (0, path_1.join)(dir, '.dockerignore');
    if (!(0, fs_1.existsSync)(ignore))
        (0, fs_1.writeFileSync)(ignore, 'node_modules\nnpm-debug.log\n.git\n');
    return file;
}
async function buildImage(projectDir, cfg, reg, log) {
    await docker.dockerVersion();
    const dir = serverPath(projectDir, cfg);
    const ref = imageRef(reg, cfg);
    log(`Building ${ref} from ${dir}`);
    await docker.build(dir, (0, path_1.join)(dir, 'Dockerfile'), ref, log);
    log(`Built ${ref}`);
    return ref;
}
function localContainerName(cfg) {
    return `edgegap-local-${cfg.imageName}`;
}
/** Runs the image like a local server (no Edgegap environment), so it behaves as in development. */
async function testLocally(cfg, reg, log) {
    const name = localContainerName(cfg);
    await docker.runLocal(imageRef(reg, cfg), name, cfg.port.port, { PORT: String(cfg.port.port) }, log);
    const scheme = cfg.port.protocol === 'WS' || cfg.port.protocol === 'WSS' ? 'ws' : cfg.port.protocol.startsWith('HTTP') ? 'http' : 'tcp';
    const url = `${scheme}://localhost:${cfg.port.port}`;
    log(`Running locally as container "${name}": connect a client to ${url}`);
    return url;
}
async function stopLocalTest(cfg, log) {
    await docker.stopLocal(localContainerName(cfg), log);
    log('Local container stopped.');
}
async function upload(api, cfg, reg, log) {
    const ref = imageRef(reg, cfg);
    await docker.login(reg.registryUrl, reg.username, reg.token, log);
    log(`Pushing ${ref}`);
    await docker.push(ref, log);
    const app = await api.ensureApp(cfg.app);
    log(app === 'created' ? `Created application ${cfg.app}` : `Using application ${cfg.app}`);
    const v = await api.upsertVersion({
        app: cfg.app,
        name: cfg.tag,
        image: `${reg.project}/${cfg.imageName}`,
        tag: cfg.tag,
        registry: reg,
        port: cfg.port,
        cpuUnits: cfg.cpuUnits,
        memoryMb: cfg.memoryMb,
        maxDurationMinutes: cfg.maxDurationMinutes,
    });
    log(`${v === 'created' ? 'Created' : 'Updated'} version ${cfg.app}/${cfg.tag}: port ${cfg.port.port} ${cfg.port.protocol}` +
        `${cfg.port.tlsUpgrade ? ' + TLS Upgrade' : ''} as "${cfg.port.name}", ${cfg.cpuUnits} CPU units / ${cfg.memoryMb} MB, ` +
        `stops after ${cfg.maxDurationMinutes} min at most.`);
}
exports.DEPLOY_TAG = 'cocos-plugin';
/** Starts one server near this machine's public IP and waits until it is ready. */
async function deployAndWait(api, cfg, log, onStarted = () => { }, timeoutMs = 300_000) {
    const ip = await api.publicIp();
    log(`Deploying ${cfg.app}/${cfg.tag} near ${ip}`);
    const requestId = await api.deploy(cfg.app, cfg.tag, [ip], [exports.DEPLOY_TAG]);
    onStarted(requestId);
    log(`Deployment ${requestId} starting...`);
    const started = Date.now();
    let last = '';
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await api.status(requestId);
        if (s.status !== last) {
            log(`  ${s.status}`);
            last = s.status;
        }
        if (s.error)
            throw new Error(`Deployment ${requestId} failed: ${s.message || s.status}. See its logs in the dashboard.`);
        if (s.ready) {
            const url = (0, api_1.connectionUrl)(s, cfg.port.name);
            log(`Ready: ${url}`);
            return { status: s, url };
        }
    }
    throw new Error(`Deployment ${requestId} not ready after ${Math.round(timeoutMs / 1000)} s.`);
}
function readJson(file, fallback) {
    try {
        return JSON.parse((0, fs_1.readFileSync)(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
