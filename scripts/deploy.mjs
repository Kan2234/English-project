// Local Docker deployment with a staging -> production promotion.
//
//   node scripts/deploy.mjs staging      build dist/, build image, run on 127.0.0.1:8081
//   node scripts/deploy.mjs production   re-check staging, then run the SAME image on port 80
//   node scripts/deploy.mjs rollback     put the previous production image back
//
// Production never rebuilds: it promotes the image that staging was checked with.
// ONTA_PROD_BIND overrides the production address (default 127.0.0.1:80; use
// 0.0.0.0:80 to expose it on the local network).
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'on-ta-web';
const STAGING = { name: 'on-ta-staging', bind: '127.0.0.1:8081', url: 'http://127.0.0.1:8081' };
const prodBind = process.env.ONTA_PROD_BIND ?? '127.0.0.1:80';
const PRODUCTION = { name: 'on-ta-prod', bind: prodBind, url: `http://127.0.0.1:${prodBind.split(':').pop()}` };

// Read-only filesystem, minimal capabilities, resource limits.
const HARDENING = [
  '--read-only',
  '--tmpfs', '/var/cache/nginx:rw,size=16m',
  '--tmpfs', '/var/run:rw,size=1m',
  '--tmpfs', '/tmp:rw,size=8m',
  '--cap-drop', 'ALL',
  '--cap-add', 'CHOWN', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'NET_BIND_SERVICE',
  '--security-opt', 'no-new-privileges',
  '--memory', '128m', '--pids-limit', '64',
];

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}
const quiet = (args) => spawnSync('docker', args, { cwd: root, encoding: 'utf8' });
const imageExists = (tag) => quiet(['image', 'inspect', tag]).status === 0;

async function waitHealthy(name) {
  for (let i = 0; i < 30; i++) {
    const state = quiet(['inspect', '-f', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}', name]).stdout.trim();
    if (state.startsWith('running') && !state.includes('starting')) {
      if (state.includes('unhealthy')) break;
      return;
    }
    if (state.startsWith('exited')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  spawnSync('docker', ['logs', '--tail', '30', name], { stdio: 'inherit' });
  console.error(`\nContainer ${name} did not become healthy.`);
  process.exit(1);
}

async function start(target, tag, extra = []) {
  quiet(['rm', '-f', target.name]);
  run('docker', ['run', '-d', '--name', target.name, '-p', `${target.bind}:80`, ...HARDENING, ...extra, tag]);
  await waitHealthy(target.name);
}

const checkSite = (url) => run(process.execPath, [join('scripts', 'check-site.mjs'), url]);

const mode = process.argv[2];
if (mode === 'staging') {
  // npm sets npm_execpath when this runs via `npm run`; calling npm-cli.js with
  // node avoids spawning npm.cmd through a shell on Windows.
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, 'run', 'build']);
  else run(process.platform === 'win32' ? 'npm run build' : 'npm', process.platform === 'win32' ? [] : ['run', 'build'], { shell: process.platform === 'win32' });
  run('docker', ['build', '-f', 'deploy/Dockerfile', '-t', `${IMAGE}:staging`, '.']);
  await start(STAGING, `${IMAGE}:staging`);
  checkSite(STAGING.url);
  console.log(`\nStaging is up: ${STAGING.url}\nTest it, then run: npm run deploy:production`);
} else if (mode === 'production') {
  if (!imageExists(`${IMAGE}:staging`)) {
    console.error('No staging image. Run: npm run deploy:staging');
    process.exit(1);
  }
  checkSite(STAGING.url); // gate: staging must still pass
  if (imageExists(`${IMAGE}:production`)) run('docker', ['tag', `${IMAGE}:production`, `${IMAGE}:previous`]);
  run('docker', ['tag', `${IMAGE}:staging`, `${IMAGE}:production`]);
  await start(PRODUCTION, `${IMAGE}:production`, ['--restart', 'unless-stopped']);
  checkSite(PRODUCTION.url);
  const id = execFileSync('docker', ['image', 'inspect', '-f', '{{.Id}}', `${IMAGE}:production`], { encoding: 'utf8' }).trim();
  console.log(`\nProduction is up: ${PRODUCTION.url}  (image ${id.slice(7, 19)})`);
} else if (mode === 'rollback') {
  if (!imageExists(`${IMAGE}:previous`)) {
    console.error('No previous production image to roll back to.');
    process.exit(1);
  }
  run('docker', ['tag', `${IMAGE}:previous`, `${IMAGE}:production`]);
  await start(PRODUCTION, `${IMAGE}:production`, ['--restart', 'unless-stopped']);
  checkSite(PRODUCTION.url);
  console.log(`\nRolled back. Production: ${PRODUCTION.url}`);
} else {
  console.error('Usage: node scripts/deploy.mjs staging|production|rollback');
  process.exit(1);
}
