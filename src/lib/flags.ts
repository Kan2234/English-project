import type { Scope } from './types';

// Per-attempt extras kept next to the exam draft (storage.ts): the questions
// flagged for review and the listening mode chosen before starting.
// Tied to the attempt by its startedAt, so leftovers from an older attempt are ignored.

export interface AttemptMeta {
  startedAt: number;
  /** question ids flagged "xem lại" */
  flagged: string[];
  /** "Chế độ thi thật": audio plays once, no seek/pause/speed, auto-advance */
  strict: boolean;
}

const metaKey = (testId: string, scope: Scope) => `onta.flags.v1.${testId}.${scope}`;

const isMeta = (v: unknown): v is AttemptMeta => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.startedAt === 'number' &&
    Number.isFinite(o.startedAt) &&
    Array.isArray(o.flagged) &&
    o.flagged.length <= 1000 &&
    o.flagged.every((x) => typeof x === 'string') &&
    typeof o.strict === 'boolean'
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
    return { startedAt: v.startedAt, flagged: [...new Set(v.flagged)], strict: v.strict };
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
