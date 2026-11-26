// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Attempt,
  clearAllLocalData,
  clearDraft,
  deleteAttempt,
  getAttempt,
  listAttempts,
  loadDraft,
  loadLearned,
  loadPractice,
  loadPracticePosition,
  newId,
  recordPractice,
  resetPracticePart,
  saveAttempt,
  saveDraft,
  savePracticePosition,
  toggleLearned,
  wrongInPractice,
} from '../../src/lib/storage';
import { brokenStorage } from './fixtures';

const ATTEMPTS = 'onta.attempts.v1';
const DRAFT = 'onta.draft.v1.mini-test-01.full';
const PRACTICE = 'onta.practice.v1';
const POS = 'onta.practice.pos.v1';
const LEARNED = 'onta.vocab.learned.v1';

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a1',
  testId: 'mini-test-01',
  scope: 'full',
  answers: { q1: 'A' },
  startedAt: 1000,
  finishedAt: 2000,
  elapsedSec: 100,
  ...over,
});
const raw = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;

// Values an old version, an extension or hand editing could leave behind.
const CORRUPT = ['{', 'null', '[]', '"x"', '1e999', '0', 'true', '{"__proto__":{"x":1}}', '[{"id":1}]', '{"a":"Z"}'];

beforeEach(() => localStorage.clear());

describe('attempts', () => {
  it('saves, lists newest first, gets and deletes', () => {
    saveAttempt(attempt({ id: 'old', finishedAt: 10 }));
    saveAttempt(attempt({ id: 'new', finishedAt: 20 }));
    expect(listAttempts().map((a) => a.id)).toEqual(['new', 'old']);
    expect(getAttempt('old')?.finishedAt).toBe(10);
    expect(getAttempt('nope')).toBeUndefined();
    deleteAttempt('new');
    expect(listAttempts().map((a) => a.id)).toEqual(['old']);
  });

  it('saving the same id replaces it', () => {
    saveAttempt(attempt({ elapsedSec: 1 }));
    saveAttempt(attempt({ elapsedSec: 2 }));
    expect(listAttempts()).toHaveLength(1);
    expect(listAttempts()[0].elapsedSec).toBe(2);
  });

  it('never saves a negative elapsedSec', () => {
    saveAttempt(attempt({ elapsedSec: -500 }));
    expect(listAttempts()[0].elapsedSec).toBe(0);
    expect((raw(ATTEMPTS) as Attempt[])[0].elapsedSec).toBe(0);
  });

  it('keeps the newest 50', () => {
    for (let i = 0; i < 55; i++) saveAttempt(attempt({ id: `a${i}`, finishedAt: i }));
    const list = listAttempts();
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe('a54');
    expect(list.at(-1)?.id).toBe('a5');
  });

  it('drops invalid entries but keeps the valid ones', () => {
    localStorage.setItem(
      ATTEMPTS,
      JSON.stringify([
        attempt({ id: 'ok' }),
        { ...attempt({ id: 'bad-scope' }), scope: 'all' },
        { ...attempt({ id: 'bad-answer' }), answers: { q1: 'E' } },
        { ...attempt({ id: 'bad-time' }), finishedAt: 'yesterday' },
        { ...attempt({ id: 'nan' }), elapsedSec: null },
        attempt({ id: 'array-answers', answers: [] as unknown as Attempt['answers'] }),
        null,
        'x',
      ]),
    );
    expect(listAttempts().map((a) => a.id)).toEqual(['ok']);
  });

  it.each(CORRUPT)('corrupt value %s falls back to an empty list', (v) => {
    localStorage.setItem(ATTEMPTS, v);
    expect(() => listAttempts()).not.toThrow();
    expect(listAttempts()).toEqual([]);
  });
});

describe('drafts', () => {
  const draft = { answers: { q1: 'B' as const }, startedAt: 5, remainingSec: 600, current: 2 };

  it('round-trips and clears', () => {
    saveDraft('mini-test-01', 'full', draft);
    expect(loadDraft('mini-test-01', 'full')).toEqual(draft);
    expect(loadDraft('mini-test-01', 'reading')).toBeNull();
    clearDraft('mini-test-01', 'full');
    expect(loadDraft('mini-test-01', 'full')).toBeNull();
  });

  it.each([
    [1e12, 3600, 3600],
    [1e308, 3600, 3600],
    [-500, 3600, 0],
    [100.7, 3600, 101],
    [3599.4, 3600, 3599],
    [600, 3600.9, 600],
    [5000, 3600.9, 3600],
  ])('remainingSec %s with limit %s is clamped to %s', (remainingSec, limit, out) => {
    localStorage.setItem(DRAFT, JSON.stringify({ ...draft, remainingSec }));
    expect(loadDraft('mini-test-01', 'full', limit)?.remainingSec).toBe(out);
  });

  it('without a limit only the lower bound applies', () => {
    localStorage.setItem(DRAFT, JSON.stringify({ ...draft, remainingSec: 1e9 }));
    expect(loadDraft('mini-test-01', 'full')?.remainingSec).toBe(1e9);
  });

  it.each([
    { ...draft, current: -1 },
    { ...draft, current: 1.5 },
    { ...draft, remainingSec: null },
    { ...draft, remainingSec: 'x' },
    { ...draft, startedAt: 'x' },
    { ...draft, answers: [] },
    { ...draft, answers: { q1: 'Z' } },
    { answers: {}, startedAt: 1 },
  ])('rejects a draft of the wrong shape: %j', (bad) => {
    localStorage.setItem(DRAFT, JSON.stringify(bad));
    expect(loadDraft('mini-test-01', 'full', 3600)).toBeNull();
  });

  it.each(CORRUPT)('corrupt value %s gives no draft', (v) => {
    localStorage.setItem(DRAFT, v);
    expect(loadDraft('mini-test-01', 'full', 3600)).toBeNull();
  });
});

describe('practice answers', () => {
  it('records the last answer per question and lists the wrong ones', () => {
    recordPractice('q1', false);
    recordPractice('q2', true);
    recordPractice('q3', false);
    recordPractice('q3', true); // answered right later: leaves the wrong list
    expect(loadPractice()).toEqual({ q1: false, q2: true, q3: true });
    expect(wrongInPractice(['q1', 'q2', 'q3', 'q4'])).toEqual(['q1']);
    expect(wrongInPractice(['q2'], { q2: false })).toEqual(['q2']);
  });

  it('rejects non-boolean maps', () => {
    localStorage.setItem(PRACTICE, JSON.stringify({ q1: 'false' }));
    expect(loadPractice()).toEqual({});
    localStorage.setItem(PRACTICE, '[true]');
    expect(loadPractice()).toEqual({});
  });
});

describe('practice position and reset', () => {
  it('remembers the set per part', () => {
    savePracticePosition(5, 'set-5b');
    savePracticePosition(3, 'set-3a');
    expect(loadPracticePosition(5)).toBe('set-5b');
    expect(loadPracticePosition(3)).toBe('set-3a');
    expect(loadPracticePosition(7)).toBeUndefined();
  });

  it('does not rewrite storage when the position is unchanged', () => {
    // same value, different formatting: a rewrite would normalise the spacing
    const stored = '{ "5": "set-5b" }';
    localStorage.setItem(POS, stored);
    savePracticePosition(5, 'set-5b');
    expect(localStorage.getItem(POS)).toBe(stored);
    savePracticePosition(5, 'set-5c');
    expect(localStorage.getItem(POS)).toBe('{"5":"set-5c"}');
  });

  it.each([{ 8: 'x' }, { 0: 'x' }, { a: 'x' }, { 5: '' }, { 5: 7 }, { 5: 'x'.repeat(200) }, ['x']])(
    'ignores a corrupt position map %j',
    (bad) => {
      localStorage.setItem(POS, JSON.stringify(bad));
      expect(loadPracticePosition(5)).toBeUndefined();
    },
  );

  it('reset forgets one part only', () => {
    recordPractice('p5-1', false);
    recordPractice('p5-2', true);
    recordPractice('p3-1', false);
    savePracticePosition(5, 's5');
    savePracticePosition(3, 's3');
    resetPracticePart(5, ['p5-1', 'p5-2']);
    expect(loadPractice()).toEqual({ 'p3-1': false });
    expect(loadPracticePosition(5)).toBeUndefined();
    expect(loadPracticePosition(3)).toBe('s3');
  });
});

describe('learned vocabulary', () => {
  it('toggles a word in and out', () => {
    expect(toggleLearned('w|n|t').has('w|n|t')).toBe(true);
    expect(loadLearned()).toEqual(new Set(['w|n|t']));
    expect(toggleLearned('w|n|t').size).toBe(0);
    expect(raw(LEARNED)).toEqual([]);
  });
  it('rejects a list with non-strings', () => {
    localStorage.setItem(LEARNED, JSON.stringify(['a', 1]));
    expect(loadLearned().size).toBe(0);
  });
});

describe('clearAllLocalData', () => {
  it('removes only onta.* keys', () => {
    localStorage.setItem(ATTEMPTS, '[]');
    localStorage.setItem('onta.anything', 'x');
    localStorage.setItem('other.app', 'keep');
    clearAllLocalData();
    expect(Object.keys(localStorage)).toEqual(['other.app']);
  });
});

describe('storage unavailable', () => {
  it('reads fall back, writes and clears do not throw', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(listAttempts()).toEqual([]);
    expect(loadDraft('t', 'full')).toBeNull();
    expect(loadPractice()).toEqual({});
    expect(loadLearned().size).toBe(0);
    expect(() => saveAttempt(attempt())).not.toThrow();
    expect(() => saveDraft('t', 'full', { answers: {}, startedAt: 1, remainingSec: 1, current: 0 })).not.toThrow();
    expect(() => clearDraft('t', 'full')).not.toThrow();
    expect(() => recordPractice('q', true)).not.toThrow();
    expect(() => toggleLearned('w')).not.toThrow();
    expect(() => clearAllLocalData()).not.toThrow();
  });
});

it('newId gives distinct short ids', () => {
  const ids = new Set(Array.from({ length: 200 }, newId));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(id).toMatch(/^[0-9a-z]{6,20}$/);
});
