import { describe, expect, it } from 'vitest';
import {
  assetSet,
  deleteOutcome,
  deployedVersionId,
  deploymentsTable,
  fullVersionOf,
  isNoWorker,
  parseJsonOutput,
  parseNdjson,
  previousVersion,
  sanitizeMessage,
} from '../../scripts/cf-versions.mjs';

// Shapes as printed by wrangler 4.159.0 (see the header of scripts/cf-versions.mjs).
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const deployment = (created: string, versions: [string, number][], annotations: Record<string, string> = {}) => ({
  id: `d-${created}`,
  source: 'wrangler',
  strategy: 'percentage',
  author_email: 'ci@example.com',
  created_on: created,
  annotations,
  versions: versions.map(([version_id, percentage]) => ({ version_id, percentage })),
});

describe('WRANGLER_OUTPUT_FILE_PATH entries', () => {
  const file = [
    '{"type":"wrangler-session","version":1,"wrangler_version":"4.159.0","command_line_args":["deploy"]}',
    'not json',
    '',
    `{"type":"deploy","version":1,"worker_name":"english-project","worker_tag":"abc","version_id":"${B}","targets":["https://english-project.example.workers.dev"],"wrangler_environment":""}`,
  ].join('\n');

  it('skips lines that are not JSON objects', () => {
    expect(parseNdjson(file).map((e) => e.type)).toEqual(['wrangler-session', 'deploy']);
    expect(parseNdjson(undefined)).toEqual([]);
  });

  it('reads the version ID of the last deploy', () => {
    expect(deployedVersionId(file)).toBe(B);
    expect(deployedVersionId(`${file}\n{"type":"deploy","version_id":"${C}"}`)).toBe(C);
  });

  it('fails without a deploy entry or with a malformed version ID', () => {
    expect(() => deployedVersionId('{"type":"wrangler-session"}')).toThrow(/did not complete/);
    // a dry run writes version_id: null
    expect(() => deployedVersionId('{"type":"deploy","version_id":null}')).toThrow(/unexpected version_id/);
  });

  it('recognises "no such Worker" and "no deployments", nothing else', () => {
    expect(isNoWorker([{ type: 'command-failed', version: 1, code: 10007, message: 'A request to the Cloudflare API failed.' }])).toBe(true);
    expect(isNoWorker([{ type: 'command-failed', version: 1, message: 'The Worker english-project-drill has no deployments.' }])).toBe(true);
    expect(isNoWorker([{ type: 'command-failed', version: 1, code: 10000, message: 'Authentication error' }])).toBe(false);
    expect(isNoWorker([])).toBe(false);
  });
});

describe('deployments status --json', () => {
  it('parses the JSON, also after stray lines', () => {
    const d = deployment('2026-11-27T10:00:00Z', [[A, 100]]);
    expect(parseJsonOutput(JSON.stringify(d, null, 2))).toEqual(d);
    expect(parseJsonOutput(`some notice\n${JSON.stringify(d, null, 2)}\n`)).toEqual(d);
    expect(() => parseJsonOutput('✘ [ERROR] boom')).toThrow(/did not print JSON/);
  });

  it('returns the version at 100%', () => {
    expect(fullVersionOf(deployment('t', [[A, 100]]))).toBe(A);
  });

  it('refuses a split (gradual) deployment and malformed data', () => {
    expect(() => fullVersionOf(deployment('t', [[A, 90], [B, 10]]))).toThrow(/splits traffic/);
    expect(() => fullVersionOf(deployment('t', []))).toThrow(/no versions/);
    expect(() => fullVersionOf({})).toThrow(/no versions/);
    expect(() => fullVersionOf(deployment('t', [['not-a-uuid', 100]]))).toThrow(/unexpected version_id/);
  });
});

describe('previous version (deployments list --json, oldest first)', () => {
  it('is the 100% version before the active deployment', () => {
    const list = [deployment('2026-11-01T00:00:00Z', [[A, 100]]), deployment('2026-11-02T00:00:00Z', [[B, 100]]), deployment('2026-11-03T00:00:00Z', [[C, 100]])];
    expect(previousVersion(list)).toBe(B);
    // order of the input does not matter
    expect(previousVersion([...list].reverse())).toBe(B);
  });

  it('skips split deployments and redeploys of the active version', () => {
    const list = [
      deployment('2026-11-01T00:00:00Z', [[A, 100]]),
      deployment('2026-11-02T00:00:00Z', [[A, 50], [B, 50]]),
      deployment('2026-11-03T00:00:00Z', [[B, 100]]), // e.g. a secret change: same version
      deployment('2026-11-04T00:00:00Z', [[B, 100]]),
    ];
    expect(previousVersion(list)).toBe(A);
  });

  it('refuses when the active deployment is already a rollback', () => {
    const base = [deployment('2026-11-01T00:00:00Z', [[A, 100]]), deployment('2026-11-02T00:00:00Z', [[B, 100]])];
    for (const annotations of [
      { 'workers/message': 'auto-rollback v1.2.0' },
      { 'workers/message': 'manual rollback: broken audio' },
      { 'workers/message': 'Rollback' },
      { 'workers/triggered_by': 'rollback' },
    ]) {
      expect(() => previousVersion([...base, deployment('2026-11-03T00:00:00Z', [[A, 100]], annotations)])).toThrow(/already a rollback/);
    }
  });

  it('fails when there is nothing to go back to', () => {
    expect(() => previousVersion([])).toThrow(/no deployments/);
    expect(() => previousVersion([deployment('2026-11-01T00:00:00Z', [[A, 100]])])).toThrow(/no earlier version/);
  });
});

describe('sanitizeMessage', () => {
  it('keeps ordinary text', () => {
    expect(sanitizeMessage('auto-rollback v1.2.3')).toBe('auto-rollback v1.2.3');
    expect(sanitizeMessage('audio 404 on /data/audio (#12)')).toBe('audio 404 on /data/audio (#12)');
  });

  it('removes shell, markdown and control characters, folds lines, drops accents', () => {
    expect(sanitizeMessage('a`$(rm -rf /)`; b\n| c | <script>')).toBe('a (rm -rf /) ; b c script');
    expect(sanitizeMessage('Lỗi âm thanh')).toBe('Loi am thanh');
    expect(sanitizeMessage('\u0000\u001b[31mred')).toBe('31mred');
  });

  it('never starts like a flag and is at most 100 characters', () => {
    expect(sanitizeMessage('--force now')).toBe('force now');
    expect(sanitizeMessage(' - - x')).toBe('x');
    expect(sanitizeMessage('x'.repeat(300))).toHaveLength(100);
    expect(sanitizeMessage(undefined)).toBe('');
  });
});

describe('assetSet', () => {
  it('is the sorted, de-duplicated list of ./assets/* references', () => {
    const html = '<script src="./assets/index-B2.js"></script><link href="./assets/index-A1.css"><link href="./assets/index-B2.js">';
    expect(assetSet(html)).toEqual(['./assets/index-A1.css', './assets/index-B2.js']);
    expect(assetSet('<html></html>')).toEqual([]);
  });
});

describe('deploymentsTable', () => {
  it('lists newest first and sanitises every cell', () => {
    const table = deploymentsTable([
      deployment('2026-11-01T00:00:00Z', [[A, 100]], { 'workers/message': 'release v1.0.0' }),
      deployment('2026-11-02T00:00:00Z', [[B, 100]], { 'workers/message': 'x | y `z`', 'workers/triggered_by': 'rollback' }),
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toMatch(/^\| Created/);
    expect(lines[2]).toContain(B);
    expect(lines[2]).toContain('rollback');
    expect(lines[2]).toContain('x y z');
    expect(lines[3]).toContain('release v1.0.0');
  });
});

describe('deleteOutcome (DELETE /workers/scripts/{name})', () => {
  it('2xx with success is deleted', () => {
    expect(deleteOutcome(200, { success: true, errors: [] })).toBe('deleted');
  });
  it('404 or API error 10007 means the Worker is already gone', () => {
    expect(deleteOutcome(404, null)).toBe('absent');
    expect(deleteOutcome(400, { success: false, errors: [{ code: 10007, message: 'workers.api.error.script_not_found' }] })).toBe('absent');
  });
  it('an auth error (as in the first drill) is an Error with the code', () => {
    const r = deleteOutcome(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toContain('HTTP 403');
    expect((r as Error).message).toContain('code 10000');
  });
  it('2xx with success:false or an unparsable body is not treated as deleted', () => {
    expect(deleteOutcome(200, { success: false, errors: [{ code: 1, message: 'x' }] })).toBeInstanceOf(Error);
    expect(deleteOutcome(500, null)).toBeInstanceOf(Error);
  });
});
