// Small hand-built bundles for the src/lib unit tests. Only the fields the code
// under test reads are filled in; the rest is cast.
import type { Bundle, Label, Question, QuestionSet, Test } from '../../src/lib/types';

let n = 0;

export function mkQ(answer: Label = 'A', extra: Partial<Question> = {}): Question {
  n += 1;
  return {
    id: `q${n}`,
    number: n,
    prompt: null,
    choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
    answer,
    explanation_vi: '',
    ...extra,
  };
}

export function mkSet(id: string, part: number, questions: Question[], extra: Partial<QuestionSet> = {}): QuestionSet {
  return { id, part, questions, ...extra };
}

export function mkTest(id: string, type: Test['test_type'], sets: QuestionSet[], extra: Partial<Test> = {}): Test {
  return {
    id,
    title: id,
    test_type: type,
    format_code: 'LR',
    question_count: sets.reduce((s, x) => s + x.questions.length, 0),
    sets,
    ...extra,
  };
}

/** Score table: scaled = 5 * raw (capped at 495), for every raw score 0..100, both sections. */
export function conversion(): Bundle['score_conversion'] {
  return (['listening', 'reading'] as const).flatMap((section) =>
    Array.from({ length: 101 }, (_, raw) => ({ section, correct_answers: raw, scaled_score: Math.min(495, Math.max(5, raw * 5)) })),
  );
}

export function bundle(tests: Test[]): Bundle {
  return {
    tests,
    score_conversion: conversion(),
    score_levels: [
      { min_score: 10, max_score: 115, cefr: 'Dưới A1', label_vi: '', description_vi: '' },
      { min_score: 120, max_score: 220, cefr: 'A1', label_vi: '', description_vi: '' },
      { min_score: 225, max_score: 545, cefr: 'A2', label_vi: '', description_vi: '' },
      { min_score: 550, max_score: 780, cefr: 'B1', label_vi: '', description_vi: '' },
      { min_score: 785, max_score: 940, cefr: 'B2', label_vi: '', description_vi: '' },
      { min_score: 945, max_score: 990, cefr: 'C1', label_vi: '', description_vi: '' },
    ],
  } as unknown as Bundle;
}

const deny = () => {
  throw new DOMException('denied', 'SecurityError');
};
/** A localStorage whose every access throws, like blocked site data or a full quota. */
export function brokenStorage(): Storage {
  return new Proxy({} as Storage, { get: deny, ownKeys: deny, has: deny });
}
