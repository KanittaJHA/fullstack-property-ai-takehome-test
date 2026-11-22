import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const frontPort = process.env.FRONTEND_PORT || '3100';
const backPort = process.env.BACKEND_PORT || '4000';
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try { if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ }
  }
  setTimeout(() => process.exit(code), 1500).unref();
}
function start(directory, args, env) {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: `${root}${directory}`, stdio: 'inherit', detached: process.platform !== 'win32', env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('error', () => { console.error(`Could not start ${directory}. Run npm run setup first.`); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
start('backend', ['run', 'dev'], { PORT: backPort, FRONTEND_ORIGIN: `http://localhost:${frontPort}` });
start('frontend', ['exec', '--', 'next', 'dev', '--port', frontPort], { BACKEND_URL: `http://127.0.0.1:${backPort}` });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
