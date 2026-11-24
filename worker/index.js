// Cloudflare Worker in front of the static assets (see wrangler.jsonc).
//
// Only /data/audio/* is routed here (assets.run_worker_first). Workers static
// assets answer a Range request with 200 + the whole file, which stops the
// browser from seeking in the audio player. This Worker reads the MP3 from the
// ASSETS binding and answers Range requests with 206 Partial Content.
//
// _headers rules do not apply to responses built by a Worker, so the security
// headers are set here too. Keep them in sync with public/_headers and
// deploy/security-headers.conf.

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function withHeaders(body, status, base, extra = {}) {
  const headers = new Headers(base);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(body, { status, headers });
}

/**
 * Parses a single "bytes=" range against a file size.
 * Returns {start, end} (inclusive), null when the header should be ignored
 * (not a bytes range, or several ranges), or 'invalid' when unsatisfiable.
 */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return 'invalid';
  let start;
  let end;
  if (a === '') {
    // suffix range: last N bytes
    const n = Number(b);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withHeaders('Method Not Allowed', 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
    }

    // Always fetch the asset with GET so we can measure and slice the body.
    const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
    const path = new URL(request.url).pathname;
    if (asset.status !== 200 || !path.startsWith('/data/audio/')) {
      return withHeaders(request.method === 'HEAD' ? null : asset.body, asset.status, asset.headers);
    }

    const data = await asset.arrayBuffer();
    const size = data.byteLength;
    const base = {
      'Content-Type': asset.headers.get('Content-Type') ?? 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    const etag = asset.headers.get('ETag');
    if (etag) base.ETag = etag;

    const rangeHeader = request.headers.get('Range');
    // If-Range: only honour the range when the client's copy is still current.
    const ifRange = request.headers.get('If-Range');
    const range = rangeHeader && (!ifRange || ifRange === etag) ? parseRange(rangeHeader, size) : null;

    if (range === 'invalid') {
      return withHeaders(null, 416, { ...base, 'Content-Range': `bytes */${size}` });
    }
    if (range) {
      const { start, end } = range;
      return withHeaders(request.method === 'HEAD' ? null : data.slice(start, end + 1), 206, {
        ...base,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      });
    }
    return withHeaders(request.method === 'HEAD' ? null : data, 200, { ...base, 'Content-Length': String(size) });
  },
};
