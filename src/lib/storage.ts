import type { Answers, Scope } from './types';

// Everything here lives only in this browser. Every access is guarded:
// storage can be unavailable (private mode, blocked site data).

export interface Attempt {
  id: string;
  testId: string;
  scope: Scope;
  answers: Answers;
  startedAt: number;
  finishedAt: number;
  elapsedSec: number;
}

export interface Draft {
  answers: Answers;
  startedAt: number;
  remainingSec: number;
  current: number; // index of the current question set
}

const ATTEMPTS = 'onta.attempts.v1';
const draftKey = (testId: string, scope: Scope) => `onta.draft.v1.${testId}.${scope}`;

// Stored values are untrusted: an older app version, a browser extension or
// manual editing can leave JSON of the wrong shape. Every reader validates the
// shape and falls back instead of letting a bad value crash the whole app.
function read<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const LABELS = new Set(['A', 'B', 'C', 'D']);
const SCOPES = new Set(['full', 'listening', 'reading']);
const isAnswers = (v: unknown): v is Answers => isObject(v) && Object.values(v).every((x) => isStr(x) && LABELS.has(x));
const isAttempt = (v: unknown): v is Attempt =>
  isObject(v) && isStr(v.id) && isStr(v.testId) && isStr(v.scope) && SCOPES.has(v.scope) && isAnswers(v.answers) &&
  isNum(v.startedAt) && isNum(v.finishedAt) && isNum(v.elapsedSec);
const isDraft = (v: unknown): v is Draft =>
  isObject(v) && isAnswers(v.answers) && isNum(v.startedAt) && isNum(v.remainingSec) && v.remainingSec >= 0 &&
  Number.isInteger(v.current) && (v.current as number) >= 0;
const isList = (v: unknown): v is unknown[] => Array.isArray(v);
const isPractice = (v: unknown): v is Record<string, boolean> => isObject(v) && Object.values(v).every((x) => typeof x === 'boolean');
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the session still works, it just isn't saved */
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const listAttempts = (): Attempt[] => read<unknown[]>(ATTEMPTS, [], isList).filter(isAttempt).sort((a, b) => b.finishedAt - a.finishedAt);
export const getAttempt = (id: string) => listAttempts().find((a) => a.id === id);
export function saveAttempt(a: Attempt) {
  write(ATTEMPTS, [a, ...listAttempts().filter((x) => x.id !== a.id)].slice(0, 50));
}
export function deleteAttempt(id: string) {
  write(ATTEMPTS, listAttempts().filter((x) => x.id !== id));
}

export const loadDraft = (testId: string, scope: Scope) => read<Draft | null>(draftKey(testId, scope), null, isDraft);
export const saveDraft = (testId: string, scope: Scope, d: Draft) => write(draftKey(testId, scope), d);
export const clearDraft = (testId: string, scope: Scope) => remove(draftKey(testId, scope));

// Practice mode: which questions were answered correctly at least once
const PRACTICE = 'onta.practice.v1';
export const loadPractice = () => read<Record<string, boolean>>(PRACTICE, {}, isPractice);
export function recordPractice(questionId: string, correct: boolean) {
  const p = loadPractice();
  p[questionId] = correct;
  write(PRACTICE, p);
}

// Vocabulary marked as learned
const LEARNED = 'onta.vocab.learned.v1';
export const loadLearned = () => new Set(read<string[]>(LEARNED, [], isStringList));
export function toggleLearned(key: string): Set<string> {
  const s = loadLearned();
  if (s.has(key)) s.delete(key);
  else s.add(key);
  write(LEARNED, [...s]);
  return s;
}

/** Removes everything this app stored (used by the crash screen). */
export function clearAllLocalData() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('onta.')) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
