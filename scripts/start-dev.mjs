import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const python = join(root, 'backend', '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const vite = join(root, 'frontend/node_modules/vite/bin/vite.js');
for (const [file, help] of [
    [python, 'Create backend/.venv and install backend dependencies first (see README.md).'],
    [vite, 'Install frontend dependencies first: npm --prefix frontend install'],
]) {
    if (!existsSync(file)) {
        console.error(help);
        process.exit(1);
    }
}

const children = [];
let stopping = false;
function stop(code) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
        if (windows) {
            // Kill only our own process tree, including Uvicorn's reload worker.
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
            killer.on('error', error => console.error('Could not stop dev process:', error.message));
        } else {
            try { process.kill(-child.pid, 'SIGTERM'); }
            catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
        }
    }
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function start(name, command, args, folder, env = process.env) {
    const child = spawn(command, args, {
        cwd: join(root, folder), env, stdio: 'inherit', detached: !windows, windowsHide: true,
    });
    children.push(child);
    child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1); });
    child.on('exit', (code, signal) => {
        if (!stopping) {
            console.error(`${name} stopped (${signal ?? code}); stopping both services.`);
            stop(code || 1);
        }
    });
}

console.log('Frontend: http://127.0.0.1:5173 | API: http://127.0.0.1:8000/docs');
console.log('Local WebSocket enabled. Press Ctrl+C to stop both services.');
start('Backend', python, ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000', '--log-config', '../scripts/backend-logging.json'], 'backend');
start('Frontend', process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], 'frontend', {
    ...process.env, VITE_WS_ENABLED: 'true', VITE_WS_URL: 'ws://127.0.0.1:8000/ws/face',
});
