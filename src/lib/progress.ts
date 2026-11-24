import type { Vocabulary } from './types';

// Study-path data (flashcard schedule, activity days for the streak). Like storage.ts,
// everything lives only in this browser, every access is guarded and every stored value
// is validated on read: a corrupt entry is dropped on its own, never the whole store,
// and never crashes a page.

const CARDS = 'onta.cards.v1';
const ACTIVITY = 'onta.activity.v1';

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: the session still works, it just isn't saved */
  }
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// ---------------------------------------------------------------- days

/** Calendar day in the learner's time zone, counted from 1970-01-01 (DST-safe: built from the local date). */
export function dayOf(ts: number): number {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}
export const today = () => dayOf(Date.now());
// Plausible day numbers only (2020-01-01 … 2100): anything else is corrupt.
const MIN_DAY = 18_262;
const MAX_DAY = 47_482;
const isDay = (v: unknown): v is number => isInt(v) && v >= MIN_DAY && v <= MAX_DAY;

// ---------------------------------------------------------------- flashcards (Leitner boxes)

/** Same key as the "đã thuộc" marks on the vocabulary page. */
export const vocabKey = (v: Pick<Vocabulary, 'word' | 'pos' | 'topic'>) => `${v.word}|${v.pos}|${v.topic}`;

export interface CardState {
  /** Leitner box 1…5: the higher the box, the longer until the card comes back */
  box: number;
  /** day number when the card is due again */
  due: number;
  /** how many times it was rated */
  reps: number;
}
export type Rating = 1 | 2 | 3; // Chưa nhớ / Nhớ mờ / Nhớ rõ

/** Days until a card in box n is shown again after "Nhớ rõ". */
const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;

const isCard = (v: unknown): v is CardState =>
  isObject(v) && isInt(v.box) && v.box >= 1 && v.box <= MAX_BOX && isDay(v.due) && isInt(v.reps) && v.reps >= 0 && v.reps < 1e6;

/** All stored card states; invalid entries are skipped and due dates are capped (a tampered far-future date). */
export function loadCards(): Map<string, CardState> {
  const raw = readRaw(CARDS);
  const out = new Map<string, CardState>();
  if (!isObject(raw)) return out;
  const cap = today() + INTERVALS[MAX_BOX];
  for (const [k, v] of Object.entries(raw)) {
    if (k.length === 0 || k.length > 200 || !isCard(v)) continue;
    out.set(k, { box: v.box, due: Math.min(v.due, cap), reps: v.reps });
  }
  return out;
}

/** The state after a rating, and how many days until the card comes back. */
export function schedule(prev: CardState | undefined, rating: Rating, day = today()): CardState {
  const box = prev?.box ?? 0; // 0 = a new card
  const reps = (prev?.reps ?? 0) + 1;
  if (rating === 1) return { box: 1, due: day, reps }; // again today, back to the first box
  if (rating === 2) return { box: Math.max(1, box), due: day + 1, reps }; // stays in its box, tomorrow
  const next = Math.min(MAX_BOX, Math.max(1, box) + 1);
  return { box: next, due: day + INTERVALS[next], reps };
}

export function rateCard(key: string, rating: Rating): CardState {
  const cards = loadCards();
  const next = schedule(cards.get(key), rating);
  cards.set(key, next);
  write(CARDS, Object.fromEntries(cards));
  markActive();
  return next;
}

export const isDue = (c: CardState | undefined, day = today()) => !!c && c.due <= day;

/** Cards of this word list that are due today or earlier (words removed from the data are ignored). */
export function dueCount(words: Vocabulary[], cards = loadCards(), day = today()): number {
  return words.reduce((n, v) => n + (isDue(cards.get(vocabKey(v)), day) ? 1 : 0), 0);
}

// ---------------------------------------------------------------- activity days and streak

/**
 * Days with a flashcard review or a practice answer (both call markActive when they happen;
 * submitted exams are added from their finishedAt by the streak on Home); the newest 400 are kept.
 */
export function loadActivity(): Set<number> {
  const raw = readRaw(ACTIVITY);
  return new Set(Array.isArray(raw) ? raw.filter(isDay) : []);
}
export function markActive(day = today()) {
  const days = loadActivity();
  if (days.has(day)) return;
  days.add(day);
  write(ACTIVITY, [...days].sort((a, b) => a - b).slice(-400));
}

/**
 * Consecutive active days ending today, or ending yesterday when today has no activity yet
 * (the streak is still alive until the day is over).
 */
export function streak(days: Set<number>, day = today()): { count: number; activeToday: boolean } {
  const activeToday = days.has(day);
  let d = activeToday ? day : day - 1;
  let count = 0;
  while (days.has(d)) {
    count++;
    d--;
  }
  return { count, activeToday };
}
