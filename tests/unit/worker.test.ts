import { describe, expect, it } from 'vitest';
import worker, { parseRange } from '../../worker/index.js';

// Mock ASSETS binding, strict about the query like the worst case on Cloudflare:
// any URL with a search string is a 404, so the Worker must strip ?v=.
const SIZE = 1000;
const MP3 = Uint8Array.from({ length: SIZE }, (_, i) => i % 256);
const ETAG = '"abc123"';
const AUDIO = '/data/audio/mini-test-01/mt01-p1-s01.mp3';

function mockEnv() {
  const seen: { url: string; method: string }[] = [];
  const env = {
    ASSETS: {
      async fetch(req: Request) {
        const u = new URL(req.url);
        seen.push({ url: u.pathname + u.search, method: req.method });
        if (u.search) return new Response('not found', { status: 404 });
        if (u.pathname === AUDIO) return new Response(MP3, { status: 200, headers: { 'Content-Type': 'audio/mpeg', ETag: ETAG } });
        if (u.pathname === '/data/audio/no-type.mp3') return new Response(MP3, { status: 200 });
        if (u.pathname === '/index.html') return new Response('<!doctype html>hi', { status: 200, headers: { 'Content-Type': 'text/html', 'X-Asset': '1' } });
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
  };
  return { env, seen };
}

const call = async (path: string, init: RequestInit = {}) => {
  const { env, seen } = mockEnv();
  const res = await worker.fetch(new Request(`https://x.example${path}`, init), env);
  return { res, seen };
};
const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

const SECURITY = [
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
];
const expectSecurityHeaders = (r: Response) => {
  for (const h of SECURITY) expect(r.headers.get(h), h).toBeTruthy();
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('x-frame-options')).toBe('DENY');
  expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
};

describe('parseRange', () => {
  it.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=900-', { start: 900, end: 999 }],
    ['bytes=-10', { start: 990, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=500-5000', { start: 500, end: 999 }],
    [' bytes=1-1 ', { start: 1, end: 1 }],
  ])('%s', (h, out) => expect(parseRange(h, SIZE)).toEqual(out));

  it.each(['bytes=-', 'bytes=-0', 'bytes=1000-', 'bytes=5-4', 'bytes=99999999999999999999-'])('%s is unsatisfiable', (h) =>
    expect(parseRange(h, SIZE)).toBe('invalid'),
  );

  it.each(['items=0-1', 'bytes=0-1,5-6', 'bytes=a-b', 'bytes 0-1', ''])('%s is ignored', (h) => expect(parseRange(h, SIZE)).toBeNull());
});

describe('worker: audio', () => {
  it('GET without Range: 200, whole file, cache + range headers', async () => {
    const { res } = await call(AUDIO);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe(String(SIZE));
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('etag')).toBe(ETAG);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await bytes(res)).toEqual(MP3);
    expectSecurityHeaders(res);
  });

  it('bytes=a-b: 206 with that slice', async () => {
    const { res } = await call(AUDIO, { headers: { Range: 'bytes=10-19' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 10-19/${SIZE}`);
    expect(res.headers.get('content-length')).toBe('10');
    expect(await bytes(res)).toEqual(MP3.slice(10, 20));
    expectSecurityHeaders(res);
  });

  it('bytes=a-: 206 to the end', async () => {
    const { res } = await call(AUDIO, { headers: { Range: 'bytes=990-' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 990-999/${SIZE}`);
    expect(await bytes(res)).toEqual(MP3.slice(990));
  });

  it('bytes=-n: 206 with the last n bytes', async () => {
    const { res } = await call(AUDIO, { headers: { Range: 'bytes=-4' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 996-999/${SIZE}`);
    expect(await bytes(res)).toEqual(MP3.slice(996));
  });

  it('unsatisfiable range: 416 with bytes */size and no body', async () => {
    for (const range of ['bytes=1000-', 'bytes=-0', 'bytes=50-10']) {
      const { res } = await call(AUDIO, { headers: { Range: range } });
      expect(res.status, range).toBe(416);
      expect(res.headers.get('content-range')).toBe(`bytes */${SIZE}`);
      expect((await bytes(res)).length).toBe(0);
      expectSecurityHeaders(res);
    }
  });

  it('several ranges are ignored: 200 with the whole file', async () => {
    const { res } = await call(AUDIO, { headers: { Range: 'bytes=0-1,5-6' } });
    expect(res.status).toBe(200);
    expect((await bytes(res)).length).toBe(SIZE);
  });

  it('If-Range matching the ETag: range honoured', async () => {
    const { res } = await call(AUDIO, { headers: { Range: 'bytes=0-9', 'If-Range': ETAG } });
    expect(res.status).toBe(206);
    expect((await bytes(res)).length).toBe(10);
  });

  it('If-Range not matching: whole file with 200', async () => {
    for (const ifRange of ['"stale"', 'Wed, 21 Oct 2015 07:28:00 GMT']) {
      const { res } = await call(AUDIO, { headers: { Range: 'bytes=0-9', 'If-Range': ifRange } });
      expect(res.status, ifRange).toBe(200);
      expect((await bytes(res)).length).toBe(SIZE);
    }
  });

  it('HEAD: same status and headers, no body', async () => {
    const full = (await call(AUDIO, { method: 'HEAD' })).res;
    expect(full.status).toBe(200);
    expect(full.headers.get('content-length')).toBe(String(SIZE));
    expect(full.body).toBeNull();
    const part = (await call(AUDIO, { method: 'HEAD', headers: { Range: 'bytes=-10' } })).res;
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 990-999/${SIZE}`);
    expect(part.body).toBeNull();
  });

  it('the ?v= cache-buster is stripped before the asset lookup; ASSETS is always asked with GET', async () => {
    const { res, seen } = await call(`${AUDIO}?v=855cf5b3`, { method: 'HEAD', headers: { Range: 'bytes=0-1' } });
    expect(res.status).toBe(206);
    expect(seen).toEqual([{ url: AUDIO, method: 'GET' }]);
  });

  it('defaults Content-Type to audio/mpeg and omits ETag when the asset has none', async () => {
    const { res } = await call('/data/audio/no-type.mp3', { headers: { Range: 'bytes=0-0', 'If-Range': '"x"' } });
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('etag')).toBeNull();
    expect(res.status).toBe(200); // If-Range cannot match without an ETag
  });

  it('a missing audio file passes the 404 through', async () => {
    const { res } = await call('/data/audio/nope.mp3', { headers: { Range: 'bytes=0-1' } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-range')).toBeNull();
    expectSecurityHeaders(res);
  });
});

describe('worker: other requests', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])('%s: 405 with Allow', async (method) => {
    const { res, seen } = await call(AUDIO, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expectSecurityHeaders(res);
    expect(seen).toEqual([]);
  });

  it('non-audio paths pass through with the asset status, body and headers', async () => {
    const { res } = await call('/index.html', { headers: { Range: 'bytes=0-1' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-asset')).toBe('1');
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(res.headers.get('content-range')).toBeNull();
    expect(await res.text()).toBe('<!doctype html>hi');
    expectSecurityHeaders(res);
  });

  it('non-audio HEAD has no body; 404s pass through', async () => {
    const head = (await call('/index.html', { method: 'HEAD' })).res;
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    const missing = (await call('/nope')).res;
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('missing');
    expectSecurityHeaders(missing);
  });
});
