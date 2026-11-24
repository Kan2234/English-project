import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { ADVANCE_SEC, PART_NAMES, SCOPE_NAMES, formatClock, isExamStart, questionsOf, scopeMinutes, setsInScope } from '../lib/exam';
import { clearDraft, loadDraft, newId, saveAttempt, saveDraft } from '../lib/storage';
import { clearMeta, loadMeta, saveMeta } from '../lib/flags';
import type { Answers, Label, QuestionSet, Scope } from '../lib/types';
import { Brand } from '../components/Layout';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';
import { AnswerSheet } from '../components/AnswerSheet';
import { AudioPlayer } from '../components/AudioPlayer';
import NotFound from './NotFound';

const isScope = (s?: string): s is Scope => s === 'full' || s === 'listening' || s === 'reading';

const KEY_LABELS: Record<string, Label> = { a: 'A', b: 'B', c: 'C', d: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };

/** First unanswered question of a set, else its first question. */
const firstOpen = (set: QuestionSet, answers: Answers) => (set.questions.find((q) => !answers[q.id]) ?? set.questions[0]).id;

export default function Exam() {
  const { testId, scope } = useParams();
  const { state } = useLocation();
  const data = useData();
  const test = data.tests.find((t) => t.id === testId);
  if (!test || !isScope(scope)) return <NotFound />;
  const start = isExamStart(state) ? state : null;
  // Opening /lam-bai/... directly must not start the clock: only resume a saved attempt,
  // otherwise send the learner to the intro page to press "Bắt đầu".
  if (!start && !loadDraft(test.id, scope, scopeMinutes(test, scope) * 60)) return <Navigate to={`/de/${test.id}`} replace state={{ needStart: scope }} />;
  // key: remount cleanly when switching between tests/scopes
  return <ExamSession key={`${test.id}/${scope}`} testId={test.id} scope={scope} strictChoice={start?.strict ?? false} />;
}

function ExamSession({ testId, scope, strictChoice }: { testId: string; scope: Scope; strictChoice: boolean }) {
  const data = useData();
  const navigate = useNavigate();
  const test = data.tests.find((t) => t.id === testId)!;
  const sets = useMemo(() => setsInScope(test, scope), [test, scope]);
  const allQuestions = useMemo(() => questionsOf(sets), [sets]);
  const limitSec = scopeMinutes(test, scope) * 60;

  const [initial] = useState(() => {
    // remainingSec comes back clamped to the limit; answers to ids outside this scope are dropped
    const d = loadDraft(testId, scope, limitSec);
    if (!d) return null;
    const ids = new Set(allQuestions.map((q) => q.id));
    const answers = Object.fromEntries(Object.entries(d.answers).filter(([id]) => ids.has(id))) as Answers;
    return { ...d, answers };
  });
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [current, setCurrent] = useState(Math.max(0, Math.min(initial?.current ?? 0, sets.length - 1)));
  const [remaining, setRemaining] = useState(initial?.remainingSec ?? limitSec);
  const [startedAt] = useState(initial?.startedAt ?? Date.now());
  // flags + listening mode live in flags.ts (storage.ts belongs to the draft); a resumed attempt keeps its mode
  const [meta] = useState(() => {
    const m = (initial ? loadMeta(testId, scope, initial.startedAt) : null) ?? { startedAt, flagged: [], strict: initial ? false : strictChoice, played: [] };
    const qids = new Set(allQuestions.map((q) => q.id));
    const sids = new Set(sets.map((s) => s.id));
    return { ...m, flagged: m.flagged.filter((id) => qids.has(id)), played: m.played.filter((id) => sids.has(id)) };
  });
  const strict = meta.strict;
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(() => new Set(meta.flagged));
  // real-exam mode: listening sets whose audio has already started in this attempt (kept across reloads)
  const [played, setPlayed] = useState<ReadonlySet<string>>(() => new Set(meta.played));
  // the set whose audio was started during the current visit to it; only that one shows a player once played
  const [liveSet, setLiveSet] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(() => firstOpen(sets[Math.max(0, Math.min(initial?.current ?? 0, sets.length - 1))], initial?.answers ?? {}));
  const [confirming, setConfirming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigated, setNavigated] = useState(false); // autoplay only after the learner moves to a new set
  const [advanceIn, setAdvanceIn] = useState<number | null>(null); // real-exam mode countdown to the next set
  const [scrollReq, setScrollReq] = useState<{ id: string | null } | null>(null);
  const [barH, setBarH] = useState(60);
  const submitted = useRef(false);
  const topRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const sheetToggleRef = useRef<HTMLButtonElement>(null);

  // keep the latest values for the timer/unload callbacks
  const latest = useRef({ answers, current, remaining });
  latest.current = { answers, current, remaining };

  const persist = useCallback(() => {
    if (submitted.current) return;
    const { answers: a, current: c, remaining: r } = latest.current;
    saveDraft(testId, scope, { answers: a, current: c, remainingSec: r, startedAt });
  }, [testId, scope, startedAt]);

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    const id = newId();
    const finishedAt = Date.now();
    saveAttempt({
      id,
      testId,
      scope,
      answers: latest.current.answers,
      startedAt,
      finishedAt,
      elapsedSec: Math.max(0, limitSec - latest.current.remaining),
    });
    clearDraft(testId, scope);
    clearMeta(testId, scope);
    navigate(`/ket-qua/${id}`, { replace: true });
  }, [testId, scope, startedAt, limitSec, navigate]);

  // countdown
  useEffect(() => {
    const t = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (remaining === 0) submit();
    else if (remaining % 15 === 0) persist();
  }, [remaining, submit, persist]);

  // save on every answer / navigation, and when the tab is hidden or closed
  useEffect(persist, [answers, current, persist]);
  useEffect(() => {
    const onHide = () => persist();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persist]);
  useEffect(() => {
    if (!submitted.current) saveMeta(testId, scope, { startedAt, flagged: [...flagged], strict, played: [...played] });
  }, [testId, scope, startedAt, flagged, strict, played]);

  // "Nộp bài?" dialog: Escape closes it, Tab stays inside, focus goes back to the button that opened it
  const openConfirm = () => {
    openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setSheetOpen(false);
    setConfirming(true);
  };
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirming(false);
        return;
      }
      const box = dialogRef.current;
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = !!active && box.contains(active);
      if (e.shiftKey ? !inside || active === first : !inside || active === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (submitted.current) return;
      const opener = openerRef.current;
      (opener?.isConnected ? opener : submitBtnRef.current)?.focus();
    };
  }, [confirming]);

  // the answer sheet panel (small screens): focus moves into it when opened, back to the toggle when dismissed
  useEffect(() => {
    if (sheetOpen) sheetCloseRef.current?.focus({ preventScroll: true });
  }, [sheetOpen]);
  const closeSheet = () => {
    setSheetOpen(false);
    sheetToggleRef.current?.focus({ preventScroll: true });
  };

  // the sticky player and passage sit below the exam bar, whose height changes when it wraps
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // scroll after the new set has rendered: to a question jumped to from the sheet, else to the top
  useEffect(() => {
    if (!scrollReq) return;
    const el = scrollReq.id ? document.getElementById(`q-${scrollReq.id}`) : null;
    if (el) el.scrollIntoView({ block: 'center' });
    else topRef.current?.scrollIntoView({ block: 'start' });
  }, [scrollReq]);

  const go = (index: number, qid?: string) => {
    const i = Math.max(0, Math.min(sets.length - 1, index));
    const target = sets[i];
    const inSet = qid !== undefined && target.questions.some((q) => q.id === qid);
    if (i !== current) {
      setCurrent(i);
      setNavigated(true);
      setLiveSet(null); // coming back to a played set later shows "đã phát", never the player
    }
    setAdvanceIn(null);
    setSheetOpen(false);
    setCurrentQ(inSet ? qid : firstOpen(target, latest.current.answers));
    setScrollReq({ id: inSet && qid !== target.questions[0].id ? qid : null });
  };
  const goRef = useRef(go);
  goRef.current = go;

  const choose = (qid: string, l: Label) => {
    setAnswers((a) => ({ ...a, [qid]: l }));
    setCurrentQ(qid);
  };
  const toggleFlag = (qid: string) =>
    setFlagged((f) => {
      const next = new Set(f);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });

  // real-exam mode: after a set's audio ends, move on by itself (paused while the submit dialog is open)
  useEffect(() => {
    if (advanceIn === null || confirming) return;
    if (advanceIn <= 0) {
      goRef.current(latest.current.current + 1);
      return;
    }
    const t = window.setTimeout(() => setAdvanceIn((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [advanceIn, confirming]);

  const set = sets[current];

  // keyboard shortcuts: A–D / 1–4 answer the current question, ←/→ previous/next set
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && sheetOpen && !confirming) {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || confirming) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = current + (e.key === 'ArrowRight' ? 1 : -1);
      if (e.repeat || next < 0 || next >= sets.length) return;
      e.preventDefault();
      go(next);
      return;
    }
    const label = KEY_LABELS[e.key.toLowerCase()];
    if (!label) return;
    const qi = Math.max(0, set.questions.findIndex((q) => q.id === currentQ));
    const q = set.questions[qi];
    if (!(label in q.choices)) return;
    e.preventDefault();
    choose(q.id, label);
    const nextQ = set.questions[qi + 1];
    if (nextQ) {
      setCurrentQ(nextQ.id);
      requestAnimationFrame(() => document.getElementById(`q-${nextQ.id}`)?.scrollIntoView({ block: 'nearest' }));
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // the question that holds keyboard focus becomes the current one
  const onQuestionsFocus = (e: FocusEvent<HTMLDivElement>) => {
    const id = (e.target as Element).closest('.question')?.id;
    if (id?.startsWith('q-') && set.questions.some((q) => q.id === id.slice(2))) setCurrentQ(id.slice(2));
  };

  const unanswered = allQuestions.length - Object.keys(answers).filter((id) => allQuestions.some((q) => q.id === id)).length;
  const first = set.questions[0].number;
  const last = set.questions[set.questions.length - 1].number;
  const listening = set.part <= 4;
  const firstListening = sets.findIndex((s) => s.part <= 4);
  const nextSet = sets[current + 1];
  const twoCol = set.part >= 6 && !!set.passages?.length;
  // real-exam mode: a set played before (earlier in this attempt, or before a reload) never plays again
  const audioSpent = strict && listening && played.has(set.id) && liveSet !== set.id;
  const flaggedCount = allQuestions.filter((q) => flagged.has(q.id)).length;

  const questions: ReactNode = (
    <div onFocus={onQuestionsFocus}>
      {set.questions.map((q) => (
        <QuestionBlock
          key={q.id}
          q={q}
          part={set.part}
          mode="exam"
          selected={answers[q.id]}
          onSelect={(l) => choose(q.id, l)}
          flagged={flagged.has(q.id)}
          onToggleFlag={() => toggleFlag(q.id)}
          current={q.id === currentQ}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="exam-bar" ref={barRef}>
        <div className="exam-bar__inner">
          <Brand />
          <span className="exam-bar__title" title={`${test.title} · ${SCOPE_NAMES[scope]}${strict ? ' · Thi thật' : ''}`}>
            {test.title}
            <span className="small" style={{ opacity: 0.7, fontWeight: 400 }}>
              <span className="exam-bar__scope">
                {'  '}
                {SCOPE_NAMES[scope]}
              </span>
              {strict && ' · Thi thật'}
            </span>
          </span>
          <span className={`timer${remaining < 300 ? ' is-low' : ''}`} role="timer" aria-label={`Còn ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </span>
          <button
            type="button"
            ref={sheetToggleRef}
            className="btn btn--ghost btn--small sheet-toggle"
            style={{ color: 'inherit' }}
            aria-expanded={sheetOpen}
            aria-controls="exam-sheet"
            onClick={() => (sheetOpen ? closeSheet() : setSheetOpen(true))}
          >
            Phiếu trả lời
          </button>
          <button type="button" ref={submitBtnRef} className="btn btn--ink btn--small" onClick={openConfirm}>
            Nộp bài
          </button>
        </div>
      </div>

      <div className="exam" style={{ '--bar-h': `${barH}px` } as CSSProperties}>
        <main ref={topRef} className="exam__main">
          <div className="set-head">
            <span className="part-tag">
              Part {set.part}
              <span className="muted" style={{ fontWeight: 500 }}>
                {PART_NAMES[set.part]}
              </span>
            </span>
            <h2>{first === last ? `Câu ${first}` : `Câu ${first}–${last}`}</h2>
          </div>

          {listening && (
            <div className="exam__audio">
              {audioSpent ? (
                <div className="audio-spent" role="status">
                  <span>
                    <strong>Audio nhóm này đã phát.</strong> Chế độ thi thật chỉ cho nghe một lần, bạn vẫn sửa được đáp án.
                  </span>
                  {nextSet && (
                    <button type="button" className="btn btn--small" onClick={() => go(current + 1)}>
                      {nextSet.part >= 5 ? 'Sang phần Đọc' : 'Sang nhóm tiếp theo'}
                    </button>
                  )}
                </div>
              ) : (
                <AudioPlayer
                  src={set.audio_url}
                  autoPlay={navigated}
                  durationHint={set.audio_duration_sec}
                  label={`Audio câu ${first}`}
                  locked={strict}
                  suspended={confirming}
                  startLabel={current === firstListening ? 'Bấm để bắt đầu phần Nghe' : 'Bấm để phát audio nhóm này'}
                  onStart={() => {
                    if (!strict) return;
                    const id = set.id;
                    setLiveSet(id);
                    setPlayed((p) => (p.has(id) ? p : new Set(p).add(id)));
                  }}
                  onEnded={() => {
                    if (strict && latest.current.current < sets.length - 1) setAdvanceIn(ADVANCE_SEC);
                  }}
                />
              )}
              {advanceIn !== null && (
                <p className="advance" role="status">
                  Audio đã hết. Tự chuyển sang {nextSet && nextSet.part >= 5 && set.part <= 4 ? 'phần Đọc' : 'nhóm tiếp theo'} sau{' '}
                  <strong className="advance__n">{Math.max(advanceIn, 0)}</strong> giây.
                </p>
              )}
            </div>
          )}

          {twoCol ? (
            <div className="set-split" key={set.id}>
              <div className="set-split__passage" tabIndex={0} role="region" aria-label={`Đoạn văn câu ${first}–${last}`}>
                <Stimulus set={set} withAudio={false} />
              </div>
              {questions}
            </div>
          ) : (
            <>
              <Stimulus set={set} withAudio={false} />
              <div style={{ marginTop: 12 }}>{questions}</div>
            </>
          )}

          <div className="exam__nav">
            <button type="button" className="btn btn--ghost" onClick={() => go(current - 1)} disabled={current === 0}>
              Nhóm trước
            </button>
            <span className="small muted" style={{ alignSelf: 'center' }}>
              {current + 1}/{sets.length}
            </span>
            {current < sets.length - 1 ? (
              <button type="button" className="btn" onClick={() => go(current + 1)}>
                Nhóm tiếp theo
              </button>
            ) : (
              <button type="button" className="btn btn--ink" onClick={openConfirm}>
                Nộp bài
              </button>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 20 }}>
            Bài làm được lưu tự động. <Link to={`/de/${test.id}`}>Thoát và làm tiếp sau</Link>
          </p>
          <p className="small muted exam__keys">
            Phím tắt: <kbd>A</kbd>–<kbd>D</kbd> hoặc <kbd>1</kbd>–<kbd>4</kbd> chọn đáp án cho câu đang chọn, <kbd>←</kbd> <kbd>→</kbd> chuyển nhóm.
          </p>
        </main>

        {/* on small screens this is a bottom panel over a dimmed backdrop; tapping the backdrop closes it */}
        <aside id="exam-sheet" className={`exam__aside${sheetOpen ? ' is-open' : ''}`} onClick={(e) => e.target === e.currentTarget && closeSheet()}>
          <div className="exam__panel">
            <div className="exam__panel-head">
              <button type="button" ref={sheetCloseRef} className="btn btn--ghost btn--small" aria-label="Đóng phiếu trả lời" onClick={closeSheet}>
                Đóng
              </button>
            </div>
            <AnswerSheet
              sets={sets}
              answers={answers}
              currentSetIndex={current}
              currentQuestionId={currentQ}
              onJump={go}
              onAnswer={choose}
              flagged={flagged}
              scrollTrigger={sheetOpen}
            />
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title" aria-describedby="submit-desc" ref={dialogRef}>
            <h2 id="submit-title">Nộp bài?</h2>
            <p id="submit-desc">
              {unanswered > 0
                ? `Bạn còn ${unanswered} câu chưa trả lời. TOEIC không trừ điểm câu sai, nên hãy chọn một đáp án cho mọi câu trước khi nộp.`
                : 'Bạn đã trả lời tất cả các câu. Sau khi nộp sẽ không sửa được đáp án.'}
              {flaggedCount > 0 && ` Còn ${flaggedCount} câu bạn đánh dấu xem lại.`}
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)} autoFocus>
                Làm tiếp
              </button>
              <button type="button" className="btn btn--ink" onClick={submit}>
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
