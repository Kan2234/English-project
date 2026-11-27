// Invariants of the generated question bank (database/toeic.json, built by database/build.mjs).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isExam } from '../../src/lib/exam';
import type { Bundle, Label } from '../../src/lib/types';

const DB = join(import.meta.dirname, '..', '..', 'database');
const data = JSON.parse(readFileSync(join(DB, 'toeic.json'), 'utf8')) as Bundle;
const LABELS = new Set<string>(['A', 'B', 'C', 'D']);

const sets = data.tests.flatMap((t) => t.sets.map((s) => ({ t, s })));
const questions = sets.flatMap(({ t, s }) => s.questions.map((q) => ({ t, s, q })));

const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe('toeic.json', () => {
  it('has tests, questions and a score table for both sections', () => {
    expect(data.tests.length).toBeGreaterThan(0);
    expect(questions.length).toBeGreaterThan(0);
    for (const section of ['listening', 'reading'] as const) {
      const rows = data.score_conversion.filter((r) => r.section === section).map((r) => r.correct_answers);
      expect(new Set(rows).size, section).toBe(101); // raw 0..100
    }
  });

  it('ids are unique (tests, sets, questions)', () => {
    expect(dupes(data.tests.map((t) => t.id))).toEqual([]);
    expect(dupes(sets.map(({ s }) => s.id))).toEqual([]);
    expect(dupes(questions.map(({ q }) => q.id))).toEqual([]);
  });

  it('every answer is one of its choices, and choices are labelled A-D', () => {
    const bad = questions.filter(({ q }) => !Object.keys(q.choices).every((l) => LABELS.has(l)) || !(q.answer in q.choices) || !q.choices[q.answer]);
    expect(bad.map(({ q }) => q.id)).toEqual([]);
  });

  it('why_wrong_vi keys are valid labels of that question, never the answer', () => {
    const bad = questions.flatMap(({ q }) =>
      Object.keys(q.why_wrong_vi ?? {})
        .filter((l) => !LABELS.has(l) || !(l in q.choices) || l === q.answer || !q.why_wrong_vi?.[l as Label])
        .map((l) => `${q.id}:${l}`),
    );
    expect(bad).toEqual([]);
  });

  it('every media URL carries ?v= = first 8 hex of the sha256 of its file', () => {
    const urls = sets.flatMap(({ s }) => [s.audio_url, s.image_url].filter((u): u is string => !!u));
    expect(urls.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const url of urls) {
      const m = /^((?:audio|images)\/[\w./-]+)\?v=([0-9a-f]{8})$/.exec(url);
      if (!m) {
        bad.push(`${url}: bad format`);
        continue;
      }
      const file = join(DB, m[1]);
      if (!existsSync(file)) {
        bad.push(`${url}: missing file`);
        continue;
      }
      const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
      if (hash !== m[2]) bad.push(`${url}: expected ${hash}`);
    }
    expect(bad).toEqual([]);
  });

  it('exam tests number their questions 1..N without gaps, and question_count matches', () => {
    for (const t of data.tests.filter(isExam)) {
      const nums = t.sets.flatMap((s) => s.questions.map((q) => q.number));
      expect(nums, t.id).toEqual(nums.map((_, i) => i + 1));
      expect(t.question_count, t.id).toBe(nums.length);
    }
  });

  it('exam tests run Part 1 to 7 in order, listening before reading', () => {
    for (const t of data.tests.filter(isExam)) {
      const parts = t.sets.map((s) => s.part);
      expect(parts, t.id).toEqual([...parts].sort((a, b) => a - b));
    }
  });

  it('listening sets of exam tests have audio', () => {
    const missing = data.tests.filter(isExam).flatMap((t) => t.sets.filter((s) => s.part <= 4 && !s.audio_url).map((s) => s.id));
    expect(missing).toEqual([]);
  });

  it('part-drill banks are never full tests and never exams', () => {
    const drills = data.tests.filter((t) => t.test_type === 'part-drill');
    expect(drills.length).toBeGreaterThan(0);
    for (const t of drills) {
      expect(t.test_type).not.toBe('full');
      expect(isExam(t)).toBe(false);
    }
    expect(data.tests.every((t) => ['full', 'mini', 'part-drill'].includes(t.test_type))).toBe(true);
  });
});
