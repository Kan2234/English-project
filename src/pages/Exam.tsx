import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, formatClock, questionsOf, scopeMinutes, setsInScope } from '../lib/exam';
import { clearDraft, loadDraft, newId, saveAttempt, saveDraft } from '../lib/storage';
import type { Answers, Label, Scope } from '../lib/types';
import { Brand } from '../components/Layout';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';
import { AnswerSheet } from '../components/AnswerSheet';
import NotFound from './NotFound';

const isScope = (s?: string): s is Scope => s === 'full' || s === 'listening' || s === 'reading';

export default function Exam() {
  const { testId, scope } = useParams();
  const data = useData();
  const test = data.tests.find((t) => t.id === testId);
  if (!test || !isScope(scope)) return <NotFound />;
  // key: remount cleanly when switching between tests/scopes
  return <ExamSession key={`${test.id}/${scope}`} testId={test.id} scope={scope} />;
}

function ExamSession({ testId, scope }: { testId: string; scope: Scope }) {
  const data = useData();
  const navigate = useNavigate();
  const test = data.tests.find((t) => t.id === testId)!;
  const sets = useMemo(() => setsInScope(test, scope), [test, scope]);
  const allQuestions = useMemo(() => questionsOf(sets), [sets]);
  const limitSec = scopeMinutes(test, scope) * 60;

  const [initial] = useState(() => loadDraft(testId, scope));
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [current, setCurrent] = useState(Math.min(initial?.current ?? 0, sets.length - 1));
  const [remaining, setRemaining] = useState(initial?.remainingSec ?? limitSec);
  const [startedAt] = useState(initial?.startedAt ?? Date.now());
  const [confirming, setConfirming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigated, setNavigated] = useState(false); // autoplay only after the learner moves to a new set
  const submitted = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

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
      elapsedSec: limitSec - latest.current.remaining,
    });
    clearDraft(testId, scope);
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

  const go = (index: number) => {
    setCurrent(Math.max(0, Math.min(sets.length - 1, index)));
    setNavigated(true);
    setSheetOpen(false);
    topRef.current?.scrollIntoView({ block: 'start' });
  };
  const choose = (qid: string, l: Label) => setAnswers((a) => ({ ...a, [qid]: l }));

  const set = sets[current];
  const unanswered = allQuestions.length - Object.keys(answers).filter((id) => allQuestions.some((q) => q.id === id)).length;
  const first = set.questions[0].number;
  const last = set.questions[set.questions.length - 1].number;

  return (
    <>
      <div className="exam-bar">
        <div className="exam-bar__inner">
          <Brand />
          <span className="exam-bar__title">
            {test.title}
            <span className="small" style={{ opacity: 0.7, fontWeight: 400 }}>
              {'  '}
              {SCOPE_NAMES[scope]}
            </span>
          </span>
          <span className={`timer${remaining < 300 ? ' is-low' : ''}`} role="timer" aria-label={`Còn ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </span>
          <button type="button" className="btn btn--ghost btn--small sheet-toggle" style={{ color: 'inherit' }} aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
            Phiếu trả lời
          </button>
          <button type="button" className="btn btn--ink btn--small" onClick={() => setConfirming(true)}>
            Nộp bài
          </button>
        </div>
      </div>

      <div className="exam">
        <main ref={topRef} style={{ scrollMarginTop: 80 }}>
          <div className="set-head">
            <span className="part-tag">
              Part {set.part}
              <span className="muted" style={{ fontWeight: 500 }}>
                {PART_NAMES[set.part]}
              </span>
            </span>
            <h2>{first === last ? `Câu ${first}` : `Câu ${first}–${last}`}</h2>
          </div>

          <Stimulus set={set} autoPlay={navigated && set.part <= 4} />

          <div style={{ marginTop: 12 }}>
            {set.questions.map((q) => (
              <QuestionBlock key={q.id} q={q} part={set.part} mode="exam" selected={answers[q.id]} onSelect={(l) => choose(q.id, l)} />
            ))}
          </div>

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
              <button type="button" className="btn btn--ink" onClick={() => setConfirming(true)}>
                Nộp bài
              </button>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 20 }}>
            Bài làm được lưu tự động. <Link to={`/de/${test.id}`}>Thoát và làm tiếp sau</Link>
          </p>
        </main>

        <aside className={`exam__aside${sheetOpen ? ' is-open' : ''}`} onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}>
          <AnswerSheet sets={sets} answers={answers} currentSetIndex={current} onJump={go} />
        </aside>
      </div>

      {confirming && (
        <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <h2 id="submit-title">Nộp bài?</h2>
            <p>
              {unanswered > 0
                ? `Bạn còn ${unanswered} câu chưa trả lời. TOEIC không trừ điểm câu sai, nên hãy chọn một đáp án cho mọi câu trước khi nộp.`
                : 'Bạn đã trả lời tất cả các câu. Sau khi nộp sẽ không sửa được đáp án.'}
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
