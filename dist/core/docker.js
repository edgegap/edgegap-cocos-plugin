"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
exports.dockerVersion = dockerVersion;
exports.build = build;
exports.runLocal = runLocal;
exports.stopLocal = stopLocal;
exports.logsLocal = logsLocal;
exports.login = login;
exports.push = push;
// Docker commands, run with the Docker CLI on the developer's machine (Docker Desktop on Windows/macOS).
const child_process_1 = require("child_process");
/** Runs a command without a shell (arguments are passed as-is) and streams its output line by line. */
function run(cmd, args, log, opts = {}) {
    return new Promise((resolve) => {
        let output = '';
        let child;
        try {
            child = (0, child_process_1.spawn)(cmd, args, { cwd: opts.cwd, windowsHide: true });
        }
        catch (e) {
            resolve({ code: -1, output: String(e?.message || e) });
            return;
        }
        const onData = (buf) => {
            const text = buf.toString();
            output += text;
            for (const line of text.split(/\r?\n/))
                if (line.trim())
                    log(line);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (e) => resolve({ code: -1, output: output + e.message }));
        child.on('close', (code) => resolve({ code: code ?? -1, output }));
        if (opts.input !== undefined)
            child.stdin.end(opts.input);
        else
            child.stdin.end();
    });
}
async function dockerVersion() {
    const r = await run('docker', ['version', '--format', '{{.Server.Version}}'], () => { });
    if (r.code !== 0) {
        throw new Error('Docker is not running or not installed. Start Docker Desktop (https://docs.docker.com/get-docker/) and try again.');
    }
    return r.output.trim();
}
/** Always linux/amd64: Edgegap runs x86-64 Linux, and an ARM image (Apple Silicon default) fails with "exec format error". */
async function build(contextDir, dockerfile, imageRef, log) {
    const r = await run('docker', ['build', '--platform', 'linux/amd64', '-f', dockerfile, '-t', imageRef, contextDir], log);
    if (r.code !== 0)
        throw new Error(`docker build failed (exit ${r.code})`);
}
async function runLocal(imageRef, name, port, env, log) {
    await run('docker', ['rm', '-f', name], () => { });
    const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const r = await run('docker', ['run', '-d', '--rm', '--name', name, '-p', `${port}:${port}`, ...envArgs, imageRef], log);
    if (r.code !== 0)
        throw new Error(`docker run failed (exit ${r.code})`);
    return r.output.trim().split(/\r?\n/).pop() || name;
}
async function stopLocal(name, log) {
    await run('docker', ['rm', '-f', name], log);
}
async function logsLocal(name, log) {
    await run('docker', ['logs', '--tail', '50', name], log);
}
/** The password goes through stdin, never the command line, so it doesn't show in process lists or logs. */
async function login(registry, username, password, log) {
    const r = await run('docker', ['login', registry, '-u', username, '--password-stdin'], log, { input: password });
    if (r.code !== 0)
        throw new Error(`docker login ${registry} failed (exit ${r.code})`);
}
async function push(imageRef, log) {
    const r = await run('docker', ['push', imageRef], log);
    if (r.code !== 0)
        throw new Error(`docker push failed (exit ${r.code})`);
}
