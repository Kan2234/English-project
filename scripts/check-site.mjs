// Smoke + security checks against a deployed copy of the site.
// Usage: node scripts/check-site.mjs http://127.0.0.1:8081
//        node scripts/check-site.mjs https://english-project.leminhkhang2234.workers.dev
// Exits 1 if any check fails. Uses raw node:http(s) so paths such as /../ are
// sent exactly as written instead of being normalised by fetch().
import http from 'node:http';
import https from 'node:https';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8081');
const client = base.protocol === 'https:' ? https : http;
const defaultPort = base.protocol === 'https:' ? 443 : 80;
let failed = 0;
let passed = 0;

// No keep-alive: a pooled socket that the CDN already closed can hang a
// request until it times out. One fresh connection per request is slower but
// deterministic.
const agent = new client.Agent({ keepAlive: false });

// Network errors and timeouts are retried twice; if they persist the request
// resolves with status 0 so the matching check FAILs instead of crashing.
async function request(path, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await requestOnce(path, opts);
    } catch (e) {
      lastError = e;
    }
  }
  console.log(`WARN  ${lastError.message}`);
  return { status: 0, headers: {}, body: Buffer.alloc(0) };
}

function requestOnce(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = client.request(
      { host: base.hostname, servername: base.hostname, port: base.port || defaultPort, path, method, headers, agent, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout ${method} ${path}`)));
    req.on('error', reject);
    req.end();
  });
}

function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
}

// --- Functional ---
const home = await request('/');
check('GET / returns 200', home.status === 200, `status ${home.status}`);
check('index.html has app root', home.body.toString().includes('<div id="root">'));
check('index.html revalidates (no-cache / max-age=0)', /no-cache|max-age=0\b/.test(home.headers['cache-control'] ?? ''), home.headers['cache-control']);
const missingPage = await request('/khong-ton-tai');
check('unknown path returns a real 404', missingPage.status === 404, `status ${missingPage.status}`);
check('404 page is the friendly 404.html', missingPage.body.toString().includes('Không có trang này'));

const assetPaths = [...home.body.toString().matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
check('index.html references built assets', assetPaths.length >= 2, `found ${assetPaths.length}`);
for (const p of assetPaths) {
  const r = await request(`/${p}`);
  check(`GET /${p} returns 200`, r.status === 200, `status ${r.status}`);
  check(`/${p} is cached immutable`, /immutable/.test(r.headers['cache-control'] ?? ''));
}

const dataRes = await request('/data/toeic.json');
check('GET /data/toeic.json returns 200 JSON', dataRes.status === 200 && /json/.test(dataRes.headers['content-type'] ?? ''));
const data = JSON.parse(dataRes.body.toString());
const tests = data.tests ?? [];
check('bundle contains tests', tests.length > 0, `tests ${tests.length}`);

// Every audio/image the bundle points to must exist on the server.
const media = new Set();
JSON.stringify(data, (key, value) => {
  if ((key === 'audio_url' || key === 'image_url') && typeof value === 'string') media.add(value);
  return value;
});
let missing = [];
for (const url of media) {
  // Bundle paths are relative to data/ (see assetUrl in src/lib/data.tsx).
  const r = await request(`/data/${url}`, { method: 'HEAD' });
  if (r.status !== 200) missing.push(`${url} -> ${r.status}`);
}
check(`all ${media.size} audio/image files referenced by the bundle are served`, media.size > 0 && missing.length === 0, missing.slice(0, 5).join(', '));

const mp3 = [...media].find((u) => u.endsWith('.mp3'));
if (mp3) {
  const r = await request(`/data/${mp3}`, { headers: { Range: 'bytes=0-99' } });
  check('audio supports range requests (206) for seeking', r.status === 206 && r.body.length === 100, `status ${r.status}`);
  check('audio served as audio/mpeg', r.headers['content-type'] === 'audio/mpeg', r.headers['content-type']);
  const full = await request(`/data/${mp3}`);
  const size = full.body.length;
  check('audio range response has Content-Range', r.headers['content-range'] === `bytes 0-99/${size}`, r.headers['content-range']);
  check('audio advertises Accept-Ranges: bytes', full.headers['accept-ranges'] === 'bytes', full.headers['accept-ranges']);
  const mid = await request(`/data/${mp3}`, { headers: { Range: `bytes=${size - 50}-` } });
  check('audio open-ended range returns the tail', mid.status === 206 && mid.body.equals(full.body.subarray(size - 50)), `status ${mid.status}`);
  const suffix = await request(`/data/${mp3}`, { headers: { Range: 'bytes=-10' } });
  check('audio suffix range returns last bytes', suffix.status === 206 && suffix.body.equals(full.body.subarray(size - 10)), `status ${suffix.status}`);
  const bad = await request(`/data/${mp3}`, { headers: { Range: `bytes=${size + 10}-${size + 20}` } });
  check('audio unsatisfiable range returns 416', bad.status === 416, `status ${bad.status}`);
  check('security headers also on audio responses', Boolean(r.headers['content-security-policy']) && r.headers['x-content-type-options'] === 'nosniff');
}

// --- Security headers ---
const h = home.headers;
const csp = h['content-security-policy'] ?? '';
check('CSP present with script-src self', /script-src 'self'/.test(csp) && !/unsafe-(inline|eval)/.test(csp.match(/script-src[^;]*/)?.[0] ?? ''));
check("CSP frame-ancestors 'none'", /frame-ancestors 'none'/.test(csp));
check("CSP object-src 'none'", /object-src 'none'/.test(csp));
check('X-Content-Type-Options nosniff', h['x-content-type-options'] === 'nosniff');
check('X-Frame-Options DENY', h['x-frame-options'] === 'DENY');
check('Referrer-Policy set', Boolean(h['referrer-policy']));
check('Permissions-Policy set', Boolean(h['permissions-policy']));
check('Server header hides version', !/\d/.test(h['server'] ?? ''), h['server']);
const asset404 = await request('/assets/does-not-exist.js');
check('security headers also on 404 responses', Boolean(asset404.headers['content-security-policy']));

// --- Attack surface ---
const passwdLeak = (r) => r.status === 200 && r.body.toString().includes('root:');
for (const p of ['/../../../../etc/passwd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2f..%2fetc/passwd', '/data/..%2f..%2f..%2fetc/passwd', '/assets/%2e%2e%2f%2e%2e%2fetc/passwd']) {
  const r = await request(p);
  check(`path traversal blocked: ${p}`, !passwdLeak(r), `status ${r.status}`);
}
for (const p of ['/.git/config', '/.env', '/.htaccess', '/data/.hidden', '/assets/.DS_Store']) {
  const r = await request(p);
  check(`dotfile not served: ${p}`, r.status === 404, `status ${r.status}`);
}
for (const p of ['/assets/', '/data/', '/data/audio/', '/data/images/']) {
  const r = await request(p);
  check(`no directory listing: ${p}`, r.status !== 200 || !/Index of/i.test(r.body.toString()), `status ${r.status}`);
}
for (const p of ['/etc/nginx/nginx.conf', '/nginx.conf', '/Dockerfile', '/package.json', '/src/main.tsx', '/database/toeic.db', '/_headers', '/wrangler.jsonc', '/worker/index.js', '/server-status', '/nginx_status']) {
  const r = await request(p);
  check(`not exposed: ${p}`, r.status === 404, `status ${r.status}`);
}
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'TRACE', 'OPTIONS']) {
  const r = await request('/index.html', { method });
  check(`${method} rejected`, r.status === 405, `status ${r.status}`);
}
const crlf = await request('/%0d%0aSet-Cookie:%20pwned=1');
check('CRLF injection does not set headers', !(crlf.headers['set-cookie'] ?? []).some((c) => c.includes('pwned')));
const hostHdr = await request('/', { headers: { Host: 'evil.example' } });
check('foreign Host header gets no redirect to it', !(hostHdr.headers.location ?? '').includes('evil.example'));
const dirRedirect = await request('/data/audio', { headers: { Host: 'evil.example' } });
check('directory redirect does not reflect Host header', !(dirRedirect.headers.location ?? '').includes('evil.example'), dirRedirect.headers.location);

console.log(`\n${passed} passed, ${failed} failed  (${base.origin})`);
process.exit(failed ? 1 : 0);
