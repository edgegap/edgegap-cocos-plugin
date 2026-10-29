// Docker commands, run with the Docker CLI on the developer's machine (Docker Desktop on Windows/macOS).
import { spawn } from 'child_process';

export type LineLogger = (line: string) => void;

export interface RunResult { code: number; output: string }

/** Runs a command without a shell (arguments are passed as-is) and streams its output line by line. */
export function run(cmd: string, args: string[], log: LineLogger, opts: { cwd?: string; input?: string } = {}): Promise<RunResult> {
    return new Promise((resolve) => {
        let output = '';
        let child;
        try {
            child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
        } catch (e: any) {
            resolve({ code: -1, output: String(e?.message || e) });
            return;
        }
        const onData = (buf: Buffer) => {
            const text = buf.toString();
            output += text;
            for (const line of text.split(/\r?\n/)) if (line.trim()) log(line);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (e: Error) => resolve({ code: -1, output: output + e.message }));
        child.on('close', (code: number | null) => resolve({ code: code ?? -1, output }));
        if (opts.input !== undefined) child.stdin.end(opts.input);
        else child.stdin.end();
    });
}

export async function dockerVersion(): Promise<string> {
    const r = await run('docker', ['version', '--format', '{{.Server.Version}}'], () => {});
    if (r.code !== 0) {
        throw new Error('Docker is not running or not installed. Start Docker Desktop (https://docs.docker.com/get-docker/) and try again.');
    }
    return r.output.trim();
}

/** Always linux/amd64: Edgegap runs x86-64 Linux, and an ARM image (Apple Silicon default) fails with "exec format error". */
export async function build(contextDir: string, dockerfile: string, imageRef: string, log: LineLogger): Promise<void> {
    const r = await run('docker', ['build', '--platform', 'linux/amd64', '-f', dockerfile, '-t', imageRef, contextDir], log);
    if (r.code !== 0) throw new Error(`docker build failed (exit ${r.code})`);
}

export async function runLocal(imageRef: string, name: string, port: number, env: Record<string, string>, log: LineLogger): Promise<string> {
    await run('docker', ['rm', '-f', name], () => {});
    const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const r = await run('docker', ['run', '-d', '--rm', '--name', name, '-p', `${port}:${port}`, ...envArgs, imageRef], log);
    if (r.code !== 0) throw new Error(`docker run failed (exit ${r.code})`);
    return r.output.trim().split(/\r?\n/).pop() || name;
}

export async function stopLocal(name: string, log: LineLogger): Promise<void> {
    await run('docker', ['rm', '-f', name], log);
}

export async function logsLocal(name: string, log: LineLogger): Promise<void> {
    await run('docker', ['logs', '--tail', '50', name], log);
}

/** The password goes through stdin, never the command line, so it doesn't show in process lists or logs. */
export async function login(registry: string, username: string, password: string, log: LineLogger): Promise<void> {
    const r = await run('docker', ['login', registry, '-u', username, '--password-stdin'], log, { input: password });
    if (r.code !== 0) throw new Error(`docker login ${registry} failed (exit ${r.code})`);
}

export async function push(imageRef: string, log: LineLogger): Promise<void> {
    const r = await run('docker', ['push', imageRef], log);
    if (r.code !== 0) throw new Error(`docker push failed (exit ${r.code})`);
}
