// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttemptMeta, clearMeta, loadMeta, saveMeta } from '../../src/lib/flags';
import { brokenStorage } from './fixtures';

const KEY = 'onta.flags.v1.mini-test-01.full';
const meta: AttemptMeta = { startedAt: 42, flagged: ['q1', 'q2'], strict: true, played: ['s1'] };

beforeEach(() => localStorage.clear());

describe('flags meta', () => {
  it('round-trips, scoped by test and scope', () => {
    saveMeta('mini-test-01', 'full', meta);
    expect(loadMeta('mini-test-01', 'full')).toEqual(meta);
    expect(loadMeta('mini-test-01', 'listening')).toBeNull();
    expect(loadMeta('full-test-01', 'full')).toBeNull();
  });

  it('is tied to the attempt by startedAt', () => {
    saveMeta('mini-test-01', 'full', meta);
    expect(loadMeta('mini-test-01', 'full', 42)).toEqual(meta);
    expect(loadMeta('mini-test-01', 'full', 43)).toBeNull();
  });

  it('treats a missing played list as nothing played (older saves)', () => {
    localStorage.setItem(KEY, JSON.stringify({ startedAt: 1, flagged: [], strict: false }));
    expect(loadMeta('mini-test-01', 'full')).toEqual({ startedAt: 1, flagged: [], strict: false, played: [] });
  });

  it('removes duplicates', () => {
    localStorage.setItem(KEY, JSON.stringify({ startedAt: 1, flagged: ['a', 'a', 'b'], strict: false, played: ['s', 's'] }));
    expect(loadMeta('mini-test-01', 'full')).toEqual({ startedAt: 1, flagged: ['a', 'b'], strict: false, played: ['s'] });
  });

  it.each([
    '{',
    'null',
    '[]',
    '"x"',
    '1',
    JSON.stringify({ startedAt: '1', flagged: [], strict: false }),
    '{"startedAt":1e999,"flagged":[],"strict":false}', // parses to Infinity
    JSON.stringify({ startedAt: 1, flagged: 'abc', strict: false }),
    JSON.stringify({ startedAt: 1, flagged: [1], strict: false }),
    JSON.stringify({ startedAt: 1, flagged: [''], strict: false }),
    JSON.stringify({ startedAt: 1, flagged: ['x'.repeat(200)], strict: false }),
    JSON.stringify({ startedAt: 1, flagged: Array.from({ length: 1001 }, (_, i) => `q${i}`), strict: false }),
    JSON.stringify({ startedAt: 1, flagged: [], strict: 'yes' }),
    JSON.stringify({ startedAt: 1, flagged: [], strict: false, played: {} }),
    JSON.stringify({ startedAt: 1, flagged: [], strict: false, played: [null] }),
  ])('rejects corrupt meta %s', (v) => {
    localStorage.setItem(KEY, v);
    expect(loadMeta('mini-test-01', 'full')).toBeNull();
  });

  it('clearMeta removes it', () => {
    saveMeta('mini-test-01', 'full', meta);
    clearMeta('mini-test-01', 'full');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('survives unavailable storage', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(loadMeta('mini-test-01', 'full')).toBeNull();
    expect(() => saveMeta('mini-test-01', 'full', meta)).not.toThrow();
    expect(() => clearMeta('mini-test-01', 'full')).not.toThrow();
  });
});
