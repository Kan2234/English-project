import type { Answers, Bundle, Question, QuestionSet, Scope, Section, Test } from './types';

export const sectionOfPart = (part: number): Section => (part <= 4 ? 'listening' : 'reading');

export const PART_NAMES: Record<number, string> = {
  1: 'Mô tả tranh',
  2: 'Hỏi – đáp',
  3: 'Hội thoại ngắn',
  4: 'Bài nói ngắn',
  5: 'Hoàn thành câu',
  6: 'Hoàn thành đoạn văn',
  7: 'Đọc hiểu',
};

export const SCOPE_NAMES: Record<Scope, string> = {
  full: 'Cả bài (Nghe + Đọc)',
  listening: 'Chỉ phần Nghe',
  reading: 'Chỉ phần Đọc',
};

/** Timed, scored tests (Full Test, Mini Test). A "part-drill" bank is practice material, never an exam. */
export const isExam = (t: Test) => t.test_type === 'full' || t.test_type === 'mini';
export const examTests = (data: Bundle): Test[] => data.tests.filter(isExam);

/** A practice set together with the test it comes from. */
export interface PracticeItem {
  set: QuestionSet;
  test: Test;
}

// The practice bank comes first, then the Mini Test; Full Test sets are never used for
// practice, so its questions stay unseen for the real timed attempt.
const PRACTICE_ORDER: Partial<Record<Test['test_type'], number>> = { 'part-drill': 0, mini: 1 };

/** The sets of part N used by "Luyện theo phần", in practice order (the one source for every page). */
export function practiceSets(data: Bundle, part: number): PracticeItem[] {
  return data.tests
    .filter((t) => PRACTICE_ORDER[t.test_type] !== undefined)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => PRACTICE_ORDER[a.t.test_type]! - PRACTICE_ORDER[b.t.test_type]! || a.i - b.i)
    .flatMap(({ t }) => t.sets.filter((s) => s.part === part).map((set) => ({ set, test: t })));
}

export function setsInScope(test: Test, scope: Scope): QuestionSet[] {
  return scope === 'full' ? test.sets : test.sets.filter((s) => sectionOfPart(s.part) === scope);
}

export function questionsOf(sets: QuestionSet[]): Question[] {
  return sets.flatMap((s) => s.questions);
}

/** Time limit in minutes: the real test gives 45' for 100 listening and 75' for 100 reading questions. */
export function scopeMinutes(test: Test, scope: Scope): number {
  const listeningAudioSec = test.sets
    .filter((s) => s.part <= 4)
    .reduce((sum, s) => sum + (s.audio_duration_sec ?? 0), 0);
  const listeningCount = questionsOf(setsInScope(test, 'listening')).length;
  const readingCount = questionsOf(setsInScope(test, 'reading')).length;
  const listening = Math.max(Math.ceil(listeningAudioSec / 60) + 2, Math.round(listeningCount * 0.45));
  const reading = Math.round(readingCount * 0.75);
  if (scope === 'listening') return listening;
  if (scope === 'reading') return reading;
  return test.duration_minutes ?? listening + reading;
}

export interface SectionScore {
  section: Section;
  correct: number;
  total: number;
  scaled: number;
}

export interface Result {
  sections: SectionScore[];
  total: number | null; // only when both sections were taken
  correct: number;
  count: number;
  byPart: { part: number; correct: number; total: number }[];
}

export function scaledScore(data: Bundle, section: Section, correct: number, total: number): number {
  // The conversion table is for 100 questions; shorter tests are scaled proportionally (an estimate).
  const raw = total === 100 ? correct : Math.round((correct / Math.max(total, 1)) * 100);
  const row = data.score_conversion.find((r) => r.section === section && r.correct_answers === raw);
  return row?.scaled_score ?? 5;
}

export function grade(data: Bundle, test: Test, scope: Scope, answers: Answers): Result {
  const qs = test.sets.filter((s) => scope === 'full' || sectionOfPart(s.part) === scope).flatMap((s) => s.questions.map((q) => ({ q, part: s.part })));
  const sections: SectionScore[] = (['listening', 'reading'] as Section[])
    .filter((sec) => scope === 'full' || scope === sec)
    .map((sec) => {
      const list = qs.filter((x) => sectionOfPart(x.part) === sec);
      const correct = list.filter((x) => answers[x.q.id] === x.q.answer).length;
      return { section: sec, correct, total: list.length, scaled: scaledScore(data, sec, correct, list.length) };
    });
  const byPart = [1, 2, 3, 4, 5, 6, 7]
    .map((part) => {
      const list = qs.filter((x) => x.part === part);
      return { part, total: list.length, correct: list.filter((x) => answers[x.q.id] === x.q.answer).length };
    })
    .filter((p) => p.total > 0);
  return {
    sections,
    total: sections.length === 2 ? sections[0].scaled + sections[1].scaled : null,
    correct: sections.reduce((s, x) => s + x.correct, 0),
    count: qs.length,
    byPart,
  };
}

export function levelFor(data: Bundle, total: number) {
  return data.score_levels.find((l) => total >= l.min_score && total <= l.max_score);
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Part 6 passages mark blanks as ---(1)---; map the k-th blank to the set's k-th question number. */
export function blankNumber(set: QuestionSet, k: number): number | undefined {
  return set.questions[k - 1]?.number;
}

/** Router state set by the test intro page when the learner presses "Bắt đầu" / "Làm tiếp". */
export interface ExamStart {
  start: true;
  /** "Chế độ thi thật" for a new attempt (a resumed attempt keeps its own mode) */
  strict: boolean;
}
export const isExamStart = (v: unknown): v is ExamStart =>
  typeof v === 'object' && v !== null && (v as Record<string, unknown>).start === true && typeof (v as Record<string, unknown>).strict === 'boolean';

/** Real-exam mode: seconds between the end of one set's audio and the next set. */
export const ADVANCE_SEC = 6;
