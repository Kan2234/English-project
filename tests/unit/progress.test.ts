// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CardState,
  MAX_BOX,
  dayOf,
  dueCount,
  isDue,
  loadActivity,
  loadCards,
  markActive,
  rateCard,
  schedule,
  streak,
  today,
  vocabKey,
} from '../../src/lib/progress';
import { brokenStorage } from './fixtures';
import type { Vocabulary } from '../../src/lib/types';

const CARDS = 'onta.cards.v1';
const ACTIVITY = 'onta.activity.v1';
// 2026-11-20 10:00 local time; all dates below are local so the tests pass in any time zone
const NOW = new Date(2026, 10, 20, 10, 0, 0);
const D = dayOf(NOW.getTime());

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const word = (w: string): Vocabulary =>
  ({ word: w, pos: 'n', topic: 'office', ipa: '', meaning_vi: '', example_en: '', example_vi: '', level: '450', collocations: [] }) as Vocabulary;

describe('days', () => {
  it('dayOf counts calendar days in local time', () => {
    expect(dayOf(new Date(2026, 10, 20, 0, 0, 1).getTime())).toBe(D);
    expect(dayOf(new Date(2026, 10, 20, 23, 59, 59).getTime())).toBe(D);
    expect(dayOf(new Date(2026, 10, 21, 0, 0, 1).getTime())).toBe(D + 1);
    expect(dayOf(Date.UTC(1970, 0, 1, 12))).toBeGreaterThanOrEqual(-1);
  });

  it('consecutive local midnights are exactly one day apart all year (DST-safe)', () => {
    for (let i = 0; i < 366; i++) {
      const a = dayOf(new Date(2026, 0, 1 + i).getTime());
      const b = dayOf(new Date(2026, 0, 2 + i).getTime());
      expect(b - a).toBe(1);
    }
  });

  it('today follows the clock', () => {
    expect(today()).toBe(D);
    vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
    expect(today()).toBe(D + 1);
  });
});

describe('Leitner schedule', () => {
  it('a new card: Chưa nhớ -> box 1 today, Nhớ mờ -> box 1 tomorrow, Nhớ rõ -> box 2 in 3 days', () => {
    expect(schedule(undefined, 1, D)).toEqual({ box: 1, due: D, reps: 1 });
    expect(schedule(undefined, 2, D)).toEqual({ box: 1, due: D + 1, reps: 1 });
    expect(schedule(undefined, 3, D)).toEqual({ box: 2, due: D + 3, reps: 1 });
  });

  it('Nhớ rõ moves up one box at a time: 3, 7, 14, 30 days, capped at box 5', () => {
    let c: CardState = { box: 1, due: D, reps: 1 };
    const seen: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      c = schedule(c, 3, D);
      seen.push([c.box, c.due - D]);
    }
    expect(seen).toEqual([
      [2, 3],
      [3, 7],
      [4, 14],
      [5, 30],
      [5, 30],
    ]);
    expect(c.reps).toBe(6);
    expect(MAX_BOX).toBe(5);
  });

  it('Nhớ mờ keeps the box and comes back tomorrow', () => {
    expect(schedule({ box: 4, due: D, reps: 3 }, 2, D)).toEqual({ box: 4, due: D + 1, reps: 4 });
  });

  it('Chưa nhớ drops back to box 1, due today', () => {
    expect(schedule({ box: 5, due: D, reps: 9 }, 1, D)).toEqual({ box: 1, due: D, reps: 10 });
  });

  it('uses today by default', () => {
    expect(schedule(undefined, 3).due).toBe(D + 3);
  });
});

describe('cards storage', () => {
  it('rateCard stores the new state and marks today active', () => {
    const s = rateCard('w|n|t', 3);
    expect(s).toEqual({ box: 2, due: D + 3, reps: 1 });
    expect(loadCards().get('w|n|t')).toEqual(s);
    expect(loadActivity()).toEqual(new Set([D]));
    expect(rateCard('w|n|t', 3)).toEqual({ box: 3, due: D + 7, reps: 2 });
  });

  it('skips invalid entries and keeps the valid ones', () => {
    localStorage.setItem(
      CARDS,
      JSON.stringify({
        ok: { box: 2, due: D, reps: 1 },
        box0: { box: 0, due: D, reps: 1 },
        box6: { box: 6, due: D, reps: 1 },
        frac: { box: 2.5, due: D, reps: 1 },
        oldDay: { box: 2, due: 100, reps: 1 },
        farDay: { box: 2, due: 99_999, reps: 1 },
        negReps: { box: 2, due: D, reps: -1 },
        hugeReps: { box: 2, due: D, reps: 1e7 },
        str: 'x',
        [`${'k'.repeat(201)}`]: { box: 2, due: D, reps: 1 },
        '': { box: 2, due: D, reps: 1 },
      }),
    );
    expect([...loadCards().keys()]).toEqual(['ok']);
  });

  it('caps a tampered far-future due date at today + 30', () => {
    localStorage.setItem(CARDS, JSON.stringify({ w: { box: 5, due: D + 400, reps: 3 } }));
    expect(loadCards().get('w')?.due).toBe(D + 30);
  });

  it.each(['{', 'null', '[]', '"x"', '[{"box":1}]'])('corrupt store %s gives no cards', (v) => {
    localStorage.setItem(CARDS, v);
    expect(loadCards().size).toBe(0);
  });

  it('isDue and dueCount', () => {
    const a = word('alpha');
    const b = word('beta');
    const c = word('gamma');
    const cards = new Map<string, CardState>([
      [vocabKey(a), { box: 1, due: D - 2, reps: 1 }],
      [vocabKey(b), { box: 2, due: D + 1, reps: 1 }],
    ]);
    expect(isDue(cards.get(vocabKey(a)), D)).toBe(true);
    expect(isDue(cards.get(vocabKey(b)), D)).toBe(false);
    expect(isDue(undefined, D)).toBe(false);
    expect(dueCount([a, b, c], cards, D)).toBe(1);
    expect(dueCount([a, b, c], cards, D + 1)).toBe(2);
    expect(vocabKey(a)).toBe('alpha|n|office');
  });
});

describe('activity and streak', () => {
  it('counts consecutive days across midnight with the real clock', () => {
    for (const [d, h] of [
      [17, 9],
      [18, 23],
      [19, 0],
      [20, 10],
    ]) {
      vi.setSystemTime(new Date(2026, 10, d, h, 30));
      markActive();
    }
    expect(streak(loadActivity())).toEqual({ count: 4, activeToday: true });
  });

  it('a streak survives until the day is over, then breaks', () => {
    vi.setSystemTime(new Date(2026, 10, 18, 20));
    markActive();
    vi.setSystemTime(new Date(2026, 10, 19, 8));
    markActive();
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59)); // nothing yet today
    expect(streak(loadActivity())).toEqual({ count: 2, activeToday: false });
    vi.setSystemTime(new Date(2026, 10, 21, 0, 1)); // a full day missed
    expect(streak(loadActivity())).toEqual({ count: 0, activeToday: false });
  });

  it('a gap ends the count', () => {
    expect(streak(new Set([D, D - 1, D - 3, D - 4]), D)).toEqual({ count: 2, activeToday: true });
    expect(streak(new Set(), D)).toEqual({ count: 0, activeToday: false });
  });

  it('markActive stores each day once, sorted, newest 400', () => {
    markActive(D);
    markActive(D);
    markActive(D - 5);
    expect(JSON.parse(localStorage.getItem(ACTIVITY)!)).toEqual([D - 5, D]);
    localStorage.setItem(ACTIVITY, JSON.stringify(Array.from({ length: 400 }, (_, i) => D - 400 + i)));
    markActive(D);
    const days = JSON.parse(localStorage.getItem(ACTIVITY)!) as number[];
    expect(days).toHaveLength(400);
    expect(days[0]).toBe(D - 399);
    expect(days.at(-1)).toBe(D);
  });

  it('drops implausible days and survives corrupt values', () => {
    localStorage.setItem(ACTIVITY, JSON.stringify([D, 'x', 1.5, 5, 99_999, null, D - 1]));
    expect(loadActivity()).toEqual(new Set([D, D - 1]));
    for (const v of ['{', 'null', '{"a":1}', '"x"']) {
      localStorage.setItem(ACTIVITY, v);
      expect(loadActivity().size).toBe(0);
    }
  });

  it('reads fall back and writes do not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(loadCards().size).toBe(0);
    expect(loadActivity().size).toBe(0);
    expect(() => markActive()).not.toThrow();
    expect(() => rateCard('w', 2)).not.toThrow();
  });
});
