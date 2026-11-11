import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = Number(process.env.DEMO_API_PORT ?? 18828);
const webPort = Number(process.env.DEMO_WEB_PORT ?? 15248);
for (const port of [apiPort, webPort]) if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Demo ports must be integers between 1024 and 65535');
if (apiPort === webPort) throw new Error('Demo API and web ports must differ');

const apiEnv = { ...process.env, DATABASE_URL: '', PGHOST: '', QWEN_CONFIG_FILE: '', APP_AUTH_MODE: 'local-bypass', DEMO_DATA: 'true', API_HOST: '127.0.0.1', API_PORT: String(apiPort), MATERIAL_STORAGE_ROOT: resolve(root, '.demo-files') };
const children = [
  spawn(process.execPath, ['--import', resolve(root, 'server/node_modules/tsx/dist/loader.mjs'), resolve(root, 'server/src/start.ts')], { cwd: root, env: apiEnv, stdio: 'inherit' }),
  spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: root, env: { ...process.env, VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`, VITE_DEMO_MODE: 'true' }, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
console.log(`Fictional local demo: http://127.0.0.1:${webPort}/dashboard — data resets when the API restarts.`);
