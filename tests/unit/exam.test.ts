import { describe, expect, it } from 'vitest';
import {
  ADVANCE_SEC,
  blankNumber,
  examTests,
  formatClock,
  grade,
  isExam,
  isExamStart,
  levelFor,
  practiceSets,
  questionsOf,
  scaledScore,
  scopeMinutes,
  sectionOfPart,
  setsInScope,
} from '../../src/lib/exam';
import type { Answers, Label } from '../../src/lib/types';
import { bundle, mkQ, mkSet, mkTest } from './fixtures';

// A small two-section test: Part 1 (2 q), Part 3 (3 q), Part 5 (4 q), Part 7 (1 q).
function smallTest() {
  return mkTest('t', 'mini', [
    mkSet('s1', 1, [mkQ('A'), mkQ('B')], { audio_duration_sec: 50 }),
    mkSet('s3', 3, [mkQ('C'), mkQ('D'), mkQ('A')], { audio_duration_sec: 70 }),
    mkSet('s5', 5, [mkQ('A'), mkQ('B'), mkQ('C'), mkQ('D')]),
    mkSet('s7', 7, [mkQ('B')]),
  ]);
}
const ids = (t: ReturnType<typeof smallTest>) => t.sets.flatMap((s) => s.questions);
const wrong = (l: Label): Label => (l === 'A' ? 'B' : 'A');

describe('sectionOfPart', () => {
  it('Parts 1-4 are listening, 5-7 reading', () => {
    expect([1, 2, 3, 4].map(sectionOfPart)).toEqual(['listening', 'listening', 'listening', 'listening']);
    expect([5, 6, 7].map(sectionOfPart)).toEqual(['reading', 'reading', 'reading']);
  });
});

describe('isExam / examTests', () => {
  it('full and mini are exams, part-drill is not', () => {
    expect(isExam(mkTest('f', 'full', []))).toBe(true);
    expect(isExam(mkTest('m', 'mini', []))).toBe(true);
    expect(isExam(mkTest('p', 'part-drill', []))).toBe(false);
  });
  it('examTests keeps data order and drops the practice bank', () => {
    const data = bundle([mkTest('p', 'part-drill', []), mkTest('f', 'full', []), mkTest('m', 'mini', [])]);
    expect(examTests(data).map((t) => t.id)).toEqual(['f', 'm']);
  });
});

describe('setsInScope / questionsOf', () => {
  it('filters sets by section', () => {
    const t = smallTest();
    expect(setsInScope(t, 'full').map((s) => s.id)).toEqual(['s1', 's3', 's5', 's7']);
    expect(setsInScope(t, 'listening').map((s) => s.id)).toEqual(['s1', 's3']);
    expect(setsInScope(t, 'reading').map((s) => s.id)).toEqual(['s5', 's7']);
  });
  it('flattens questions in order', () => {
    const t = smallTest();
    expect(questionsOf(setsInScope(t, 'listening'))).toHaveLength(5);
    expect(questionsOf([])).toEqual([]);
  });
});

describe('practiceSets', () => {
  const data = bundle([
    mkTest('full', 'full', [mkSet('f5', 5, [mkQ()]), mkSet('f3', 3, [mkQ()])]),
    mkTest('mini', 'mini', [mkSet('m5a', 5, [mkQ()]), mkSet('m6', 6, [mkQ()]), mkSet('m5b', 5, [mkQ()])]),
    mkTest('bank', 'part-drill', [mkSet('b5a', 5, [mkQ()]), mkSet('b5b', 5, [mkQ()]), mkSet('b7', 7, [mkQ()])]),
  ]);

  it('puts the practice bank first, then the mini test, and never uses the full test', () => {
    const items = practiceSets(data, 5);
    expect(items.map((x) => x.set.id)).toEqual(['b5a', 'b5b', 'm5a', 'm5b']);
    expect(items.map((x) => x.test.id)).toEqual(['bank', 'bank', 'mini', 'mini']);
  });
  it('only returns sets of the requested part', () => {
    expect(practiceSets(data, 6).map((x) => x.set.id)).toEqual(['m6']);
    expect(practiceSets(data, 7).map((x) => x.set.id)).toEqual(['b7']);
  });
  it('a part that only the full test has gives nothing', () => {
    expect(practiceSets(data, 3)).toEqual([]);
  });
  it('keeps data order between two tests of the same type', () => {
    const two = bundle([
      mkTest('mini-b', 'mini', [mkSet('x', 2, [mkQ()])]),
      mkTest('mini-a', 'mini', [mkSet('y', 2, [mkQ()])]),
    ]);
    expect(practiceSets(two, 2).map((x) => x.set.id)).toEqual(['x', 'y']);
  });
});

describe('scopeMinutes', () => {
  it('listening: audio length + 2 min when that beats 0.45 min per question', () => {
    // audio 120 s -> 2 + 2 = 4; 5 questions * 0.45 = 2.25 -> 2; max = 4
    expect(scopeMinutes(smallTest(), 'listening')).toBe(4);
  });
  it('listening: 0.45 min per question when that is longer than the audio', () => {
    const t = mkTest('t', 'mini', [mkSet('s', 2, Array.from({ length: 40 }, () => mkQ()), { audio_duration_sec: 30 })]);
    // ceil(0.5) + 2 = 3; round(40 * 0.45) = 18
    expect(scopeMinutes(t, 'listening')).toBe(18);
  });
  it('listening: a set without audio duration counts as 0 s', () => {
    const t = mkTest('t', 'mini', [mkSet('s', 1, [mkQ()]), mkSet('s2', 1, [mkQ()], { audio_duration_sec: null })]);
    expect(scopeMinutes(t, 'listening')).toBe(2);
  });
  it('reading: 0.75 min per question', () => {
    expect(scopeMinutes(smallTest(), 'reading')).toBe(4); // round(5 * 0.75) = round(3.75)
  });
  it('full: duration_minutes when the data gives one, else listening + reading', () => {
    expect(scopeMinutes(smallTest(), 'full')).toBe(8);
    expect(scopeMinutes({ ...smallTest(), duration_minutes: 60 }, 'full')).toBe(60);
  });
  it('real 100 + 100 test: 45 and 75 minutes', () => {
    const t = mkTest('t', 'full', [
      mkSet('l', 1, Array.from({ length: 100 }, () => mkQ()), { audio_duration_sec: 45 * 60 - 200 }),
      mkSet('r', 5, Array.from({ length: 100 }, () => mkQ())),
    ]);
    expect(scopeMinutes(t, 'listening')).toBe(45);
    expect(scopeMinutes(t, 'reading')).toBe(75);
  });
});

describe('scaledScore', () => {
  const data = bundle([]);
  it('uses the table directly for 100 questions', () => {
    expect(scaledScore(data, 'listening', 100, 100)).toBe(495);
    expect(scaledScore(data, 'reading', 40, 100)).toBe(200);
    expect(scaledScore(data, 'reading', 0, 100)).toBe(5);
  });
  it('scales shorter tests to a 100-question raw score', () => {
    // 10/20 -> 50 raw -> 250
    expect(scaledScore(data, 'listening', 10, 20)).toBe(250);
    // 1/3 -> 33.3 -> 33 -> 165
    expect(scaledScore(data, 'reading', 1, 3)).toBe(165);
  });
  it('an empty section does not divide by zero', () => {
    expect(scaledScore(data, 'reading', 0, 0)).toBe(5);
  });
  it('falls back to 5 when the table has no row', () => {
    expect(scaledScore(bundle([]), 'listening', 150, 100)).toBe(5);
    expect(scaledScore({ ...data, score_conversion: [] }, 'listening', 50, 100)).toBe(5);
  });
});

describe('grade', () => {
  const t = smallTest();
  const data = bundle([t]);
  const all = ids(t);
  const perfect: Answers = Object.fromEntries(all.map((x) => [x.id, x.answer]));

  it('full scope: both sections, total = sum of scaled scores', () => {
    const r = grade(data, t, 'full', perfect);
    expect(r.count).toBe(10);
    expect(r.correct).toBe(10);
    expect(r.sections.map((s) => [s.section, s.correct, s.total, s.scaled])).toEqual([
      ['listening', 5, 5, 495],
      ['reading', 5, 5, 495],
    ]);
    expect(r.total).toBe(990);
  });
  it('counts wrong and missing answers as incorrect, per part', () => {
    const answers: Answers = { ...perfect };
    answers[all[0].id] = wrong(all[0].answer); // part 1
    delete answers[all[2].id]; // part 3, unanswered
    answers[all[9].id] = wrong(all[9].answer); // part 7
    const r = grade(data, t, 'full', answers);
    expect(r.correct).toBe(7);
    expect(r.byPart).toEqual([
      { part: 1, total: 2, correct: 1 },
      { part: 3, total: 3, correct: 2 },
      { part: 5, total: 4, correct: 4 },
      { part: 7, total: 1, correct: 0 },
    ]);
    // listening 3/5 -> 60 raw -> 300; reading 4/5 -> 80 raw -> 400
    expect(r.sections.map((s) => s.scaled)).toEqual([300, 400]);
    expect(r.total).toBe(700);
  });
  it('one section only: no 990 total', () => {
    const r = grade(data, t, 'listening', perfect);
    expect(r.sections.map((s) => s.section)).toEqual(['listening']);
    expect(r.count).toBe(5);
    expect(r.total).toBeNull();
    expect(r.byPart.map((p) => p.part)).toEqual([1, 3]);
    expect(grade(data, t, 'reading', {}).sections).toEqual([{ section: 'reading', correct: 0, total: 5, scaled: 5 }]);
  });
  it('ignores answers to questions outside the test', () => {
    const r = grade(data, t, 'full', { bogus: 'A', [all[0].id]: all[0].answer });
    expect(r.correct).toBe(1);
  });
});

describe('levelFor', () => {
  const data = bundle([]);
  it('finds the CEFR band containing the total', () => {
    expect(levelFor(data, 990)?.cefr).toBe('C1');
    expect(levelFor(data, 785)?.cefr).toBe('B2');
    expect(levelFor(data, 780)?.cefr).toBe('B1');
    expect(levelFor(data, 10)?.cefr).toBe('Dưới A1');
    expect(levelFor(data, 5)).toBeUndefined();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [59.9, '00:59'],
    [61, '01:01'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-5, '00:00'],
  ])('%s s -> %s', (sec, out) => {
    expect(formatClock(sec)).toBe(out);
  });
});

describe('blankNumber', () => {
  it('maps the k-th blank to the k-th question number', () => {
    const s = mkSet('p6', 6, [mkQ('A', { number: 131 }), mkQ('B', { number: 132 }), mkQ('C', { number: 133 })]);
    expect(blankNumber(s, 1)).toBe(131);
    expect(blankNumber(s, 3)).toBe(133);
    expect(blankNumber(s, 4)).toBeUndefined();
    expect(blankNumber(s, 0)).toBeUndefined();
  });
});

describe('isExamStart', () => {
  it('accepts only { start: true, strict: boolean }', () => {
    expect(isExamStart({ start: true, strict: false })).toBe(true);
    expect(isExamStart({ start: true, strict: true, extra: 1 })).toBe(true);
    for (const v of [null, undefined, 'start', 1, [], {}, { start: true }, { start: 'true', strict: true }, { start: true, strict: 'yes' }, { needStart: 'full' }])
      expect(isExamStart(v)).toBe(false);
  });
});

it('real-exam auto-advance delay is a few seconds', () => {
  expect(ADVANCE_SEC).toBeGreaterThan(0);
  expect(ADVANCE_SEC).toBeLessThanOrEqual(10);
});
