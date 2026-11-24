import type { Scope } from './types';

// Per-attempt extras kept next to the exam draft (storage.ts): the questions
// flagged for review, the listening mode chosen before starting and, in real-exam
// mode, the listening sets whose audio has already been played.
// Tied to the attempt by its startedAt, so leftovers from an older attempt are ignored.

export interface AttemptMeta {
  startedAt: number;
  /** question ids flagged "xem lại" */
  flagged: string[];
  /** "Chế độ thi thật": audio plays once, no seek/pause/speed, auto-advance */
  strict: boolean;
  /** real-exam mode: ids of listening sets whose audio has started once (never replayed) */
  played: string[];
}

const metaKey = (testId: string, scope: Scope) => `onta.flags.v1.${testId}.${scope}`;

const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 1000 && v.every((x) => typeof x === 'string' && x.length > 0 && x.length < 200);

// `played` is optional in storage: metas saved before it existed count as "nothing played yet"
const isMeta = (v: unknown): v is Omit<AttemptMeta, 'played'> & { played?: string[] } => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.startedAt === 'number' &&
    Number.isFinite(o.startedAt) &&
    isIdList(o.flagged) &&
    typeof o.strict === 'boolean' &&
    (o.played === undefined || isIdList(o.played))
  );
};

/** Stored meta for the attempt that started at startedAt; null when missing, corrupt or from another attempt. */
export function loadMeta(testId: string, scope: Scope, startedAt?: number): AttemptMeta | null {
  try {
    const raw = localStorage.getItem(metaKey(testId, scope));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!isMeta(v)) return null;
    if (startedAt !== undefined && v.startedAt !== startedAt) return null;
    return { startedAt: v.startedAt, flagged: [...new Set(v.flagged)], strict: v.strict, played: [...new Set(v.played ?? [])] };
  } catch {
    return null;
  }
}

export function saveMeta(testId: string, scope: Scope, meta: AttemptMeta) {
  try {
    localStorage.setItem(metaKey(testId, scope), JSON.stringify(meta));
  } catch {
    /* storage unavailable: flags still work for this session */
  }
}

export function clearMeta(testId: string, scope: Scope) {
  try {
    localStorage.removeItem(metaKey(testId, scope));
  } catch {
    /* ignore */
  }
}
