import { describe, expect, it } from 'vitest';
import { checkStatus, checkTagName } from '../../scripts/release-gate.mjs';

// The git half of the gate (main, merge commit, same tree) needs a real repository;
// it was exercised on a scratch clone. These cover the tag name and the status API.
const SHA = 'a'.repeat(40);
const status = (over: Record<string, unknown> = {}) => ({
  context: 'staging/verified',
  state: 'success',
  target_url: 'https://github.com/o/r/actions/runs/1',
  created_at: '2026-11-27T10:00:00Z',
  creator: { login: 'github-actions[bot]', type: 'Bot' },
  ...over,
});

describe('tag name', () => {
  it.each(['v1.0.0', 'v0.0.1', 'v10.20.30'])('accepts %s', (tag) => {
    expect(() => checkTagName(tag)).not.toThrow();
  });

  it.each(['1.0.0', 'v1.0', 'v1.0.0-rc.1', 'v0.0.0-drill', 'v01.0.0', 'v1.0.0+build', 'v1.0.0\n', 'refs/tags/v1.0.0', '', undefined])(
    'rejects %j',
    (tag) => {
      expect(() => checkTagName(tag)).toThrow(/strict SemVer/);
    },
  );
});

// GET /repos/{repo}/commits/{sha}/statuses: a list, newest first, each with `creator`.
describe('staging/verified status', () => {
  it('passes for success posted by github-actions[bot]', () => {
    expect(checkStatus([status({ context: 'other', state: 'failure' }), status()], SHA)).toMatchObject({ state: 'success' });
  });

  it('fails when the status is missing, not green, or posted by someone else', () => {
    expect(() => checkStatus([], SHA)).toThrow(/no staging\/verified/);
    expect(() => checkStatus({}, SHA)).toThrow(/no staging\/verified/);
    expect(() => checkStatus([status({ state: 'failure' })], SHA)).toThrow(/= failure/);
    expect(() => checkStatus([status({ state: 'pending' })], SHA)).toThrow(/= pending/);
    expect(() => checkStatus([status({ creator: { login: 'Kan2234' } })], SHA)).toThrow(/posted by Kan2234/);
    expect(() => checkStatus([status({ creator: null })], SHA)).toThrow(/posted by unknown/);
  });

  it('only the latest staging/verified counts, whatever the order of the list', () => {
    const old = status({ created_at: '2026-11-27T09:00:00Z' });
    const newerFailure = status({ state: 'failure', created_at: '2026-11-27T11:00:00Z' });
    const newerByUser = status({ creator: { login: 'someone' }, created_at: '2026-11-27T11:00:00Z' });
    expect(() => checkStatus([old, newerFailure], SHA)).toThrow(/= failure/);
    expect(() => checkStatus([newerByUser, old], SHA)).toThrow(/posted by someone/);
    expect(checkStatus([status({ state: 'failure', created_at: '2026-11-26T00:00:00Z' }), old], SHA)).toMatchObject({ state: 'success' });
  });
});
