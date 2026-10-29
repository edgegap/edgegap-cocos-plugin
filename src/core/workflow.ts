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
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, isAbsolute, resolve } from 'path';
import { connectionUrl, DeploymentStatus, EdgegapApi, PortSpec, RegistryCredentials } from './api';
import * as docker from './docker';

export interface ServerConfig {
    serverDir: string;      // relative to the Cocos project, e.g. "Server"
    imageName: string;      // e.g. "my-game-server"
    tag: string;            // UTC YYYYMMDD-HHMM; also the version name
    app: string;            // Edgegap application
    port: PortSpec;
    cpuUnits: number;
    memoryMb: number;
    maxDurationMinutes: number;
}

export const DEFAULT_PORT: PortSpec = { name: 'gameport', port: 2567, protocol: 'WS', tlsUpgrade: true };

export function defaultConfig(projectName: string): ServerConfig {
    const slug = slugify(projectName) || 'cocos-game';
    return {
        serverDir: 'Server',
        imageName: `${slug}-server`,
        tag: timestampTag(),
        app: slug,
        port: { ...DEFAULT_PORT },
        cpuUnits: 256,
        memoryMb: 512,
        maxDurationMinutes: 60,
    };
}

/** UTC timestamp YYYYMMDD-HHMM: sorts by date and shows how fresh a build is. */
export function timestampTag(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function serverPath(projectDir: string, cfg: ServerConfig): string {
    return isAbsolute(cfg.serverDir) ? cfg.serverDir : resolve(projectDir, cfg.serverDir);
}

export function imageRef(reg: RegistryCredentials, cfg: ServerConfig): string {
    return `${reg.registryUrl}/${reg.project}/${cfg.imageName}:${cfg.tag}`;
}

/** Checks everything the build needs before running Docker. Returns problems as sentences, empty when OK. */
export function validate(projectDir: string, cfg: ServerConfig): string[] {
    const problems: string[] = [];
    const dir = serverPath(projectDir, cfg);
    if (!existsSync(dir)) problems.push(`Server folder not found: ${dir}`);
    else if (!existsSync(join(dir, 'Dockerfile'))) problems.push(`No Dockerfile in ${dir}. Click "Create Dockerfile" or add your own.`);
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(cfg.imageName)) problems.push('Image name: lowercase letters, digits, ".", "_" or "-".');
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(cfg.tag) || cfg.tag === 'latest') problems.push('Tag: a build ID such as a UTC timestamp, not "latest".');
    if (!cfg.app || cfg.app.length < 3) problems.push('Application name: at least 3 characters.');
    if (!(cfg.port.port >= 1 && cfg.port.port <= 59999)) problems.push('Port: 1 to 59999.');
    if (cfg.port.tlsUpgrade && !['WS', 'HTTP'].includes(cfg.port.protocol)) problems.push('TLS Upgrade only works on WS and HTTP ports.');
    if (cfg.memoryMb < 256 || cfg.memoryMb > cfg.cpuUnits * 2) problems.push('Memory: at least 256 MB and at most 2x the CPU units.');
    return problems;
}

/** A starting Dockerfile for a Node.js game server, written only when the folder has none. */
export function nodeDockerfile(port: number): string {
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

export function writeDockerfileIfMissing(projectDir: string, cfg: ServerConfig): string | null {
    const dir = serverPath(projectDir, cfg);
    const file = join(dir, 'Dockerfile');
    if (existsSync(file)) return null;
    writeFileSync(file, nodeDockerfile(cfg.port.port));
    const ignore = join(dir, '.dockerignore');
    if (!existsSync(ignore)) writeFileSync(ignore, 'node_modules\nnpm-debug.log\n.git\n');
    return file;
}

export async function buildImage(projectDir: string, cfg: ServerConfig, reg: RegistryCredentials, log: docker.LineLogger): Promise<string> {
    await docker.dockerVersion();
    const dir = serverPath(projectDir, cfg);
    const ref = imageRef(reg, cfg);
    log(`Building ${ref} from ${dir}`);
    await docker.build(dir, join(dir, 'Dockerfile'), ref, log);
    log(`Built ${ref}`);
    return ref;
}

export function localContainerName(cfg: ServerConfig): string {
    return `edgegap-local-${cfg.imageName}`;
}

/** Runs the image like a local server (no Edgegap environment), so it behaves as in development. */
export async function testLocally(cfg: ServerConfig, reg: RegistryCredentials, log: docker.LineLogger): Promise<string> {
    const name = localContainerName(cfg);
    await docker.runLocal(imageRef(reg, cfg), name, cfg.port.port, { PORT: String(cfg.port.port) }, log);
    const scheme = cfg.port.protocol === 'WS' || cfg.port.protocol === 'WSS' ? 'ws' : cfg.port.protocol.startsWith('HTTP') ? 'http' : 'tcp';
    const url = `${scheme}://localhost:${cfg.port.port}`;
    log(`Running locally as container "${name}": connect a client to ${url}`);
    return url;
}

export async function stopLocalTest(cfg: ServerConfig, log: docker.LineLogger): Promise<void> {
    await docker.stopLocal(localContainerName(cfg), log);
    log('Local container stopped.');
}

export async function upload(api: EdgegapApi, cfg: ServerConfig, reg: RegistryCredentials, log: docker.LineLogger): Promise<void> {
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

export const DEPLOY_TAG = 'cocos-plugin';

/** Starts one server near this machine's public IP and waits until it is ready. */
export async function deployAndWait(
    api: EdgegapApi, cfg: ServerConfig, log: docker.LineLogger,
    onStarted: (requestId: string) => void = () => {}, timeoutMs = 300_000,
): Promise<{ status: DeploymentStatus; url: string }> {
    const ip = await api.publicIp();
    log(`Deploying ${cfg.app}/${cfg.tag} near ${ip}`);
    const requestId = await api.deploy(cfg.app, cfg.tag, [ip], [DEPLOY_TAG]);
    onStarted(requestId);
    log(`Deployment ${requestId} starting...`);
    const started = Date.now();
    let last = '';
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await api.status(requestId);
        if (s.status !== last) { log(`  ${s.status}`); last = s.status; }
        if (s.error) throw new Error(`Deployment ${requestId} failed: ${s.message || s.status}. See its logs in the dashboard.`);
        if (s.ready) {
            const url = connectionUrl(s, cfg.port.name);
            log(`Ready: ${url}`);
            return { status: s, url };
        }
    }
    throw new Error(`Deployment ${requestId} not ready after ${Math.round(timeoutMs / 1000)} s.`);
}

export function readJson<T>(file: string, fallback: T): T {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
