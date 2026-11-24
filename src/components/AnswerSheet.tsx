import { useEffect, useRef } from 'react';
import type { Answers, Label, QuestionSet } from '../lib/types';
import { sectionOfPart } from '../lib/exam';

interface Props {
  sets: QuestionSet[];
  answers: Answers;
  currentSetIndex: number;
  onJump: (setIndex: number, questionId?: string) => void;
  /** review: mark the key and wrong answers */
  review?: boolean;
  /** exam: clicking a bubble records that answer (and jumps to the question) */
  onAnswer?: (questionId: string, label: Label) => void;
  /** question ids flagged for review */
  flagged?: ReadonlySet<string>;
  /** the question keyboard shortcuts act on; kept scrolled into view */
  currentQuestionId?: string;
  /** any change re-runs the auto-scroll (e.g. when a collapsed sheet is opened) */
  scrollTrigger?: unknown;
}

/** Nearest scrollable ancestor below the document, or null. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** The answer sheet: every question number with four small bubbles, grouped by section. */
export function AnswerSheet({
  sets,
  answers,
  currentSetIndex,
  onJump,
  review = false,
  onAnswer,
  flagged,
  currentQuestionId,
  scrollTrigger,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rows = sets.flatMap((s, setIndex) => s.questions.map((q) => ({ q, setIndex, part: s.part })));
  const answered = rows.filter((r) => answers[r.q.id]).length;
  const flaggedCount = flagged ? rows.filter((r) => flagged.has(r.q.id)).length : 0;
  const groups = (['listening', 'reading'] as const)
    .map((sec) => ({ sec, rows: rows.filter((r) => sectionOfPart(r.part) === sec) }))
    .filter((g) => g.rows.length);
  const canAnswer = !!onAnswer && !review;

  // keep the current question visible inside the sheet's own scroll box (never scrolls the page)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const row =
      (currentQuestionId ? root.querySelector<HTMLElement>(`[data-qid="${CSS.escape(currentQuestionId)}"]`) : null) ??
      root.querySelector<HTMLElement>('.sheet__row.is-current');
    const box = row && scrollParent(root);
    if (!row || !box) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (b.height === 0) return; // hidden (collapsed on small screens)
    const pad = 48;
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad);
  }, [currentSetIndex, currentQuestionId, scrollTrigger]);

  return (
    <div className="sheet" aria-label="Phiếu trả lời" ref={rootRef}>
      <div className="sheet__head">
        <span>Phiếu trả lời</span>
        <span>
          {answered}/{rows.length} câu
          {flaggedCount > 0 && <span className="sheet__flagged"> · {flaggedCount} cần xem lại</span>}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.sec}>
          <div className="sheet__section">{g.sec === 'listening' ? 'Listening' : 'Reading'}</div>
          <div className="sheet__grid">
            {g.rows.map(({ q, setIndex }) => {
              const chosen = answers[q.id];
              const labels = Object.keys(q.choices) as Label[];
              const isFlagged = !!flagged?.has(q.id);
              const here = q.id === currentQuestionId;
              const cls = [
                'sheet__row',
                setIndex === currentSetIndex ? 'is-current' : '',
                here ? 'is-here' : '',
                isFlagged ? 'is-flagged' : '',
                canAnswer ? 'is-answerable' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                // the number button is the keyboard/screen-reader way in; clicking anywhere on the row jumps too
                <div key={q.id} className={cls} data-qid={q.id} onClick={() => onJump(setIndex, q.id)}>
                  <button
                    type="button"
                    className="sheet__n"
                    aria-current={here ? 'step' : undefined}
                    aria-label={`Câu ${q.number}${chosen ? `, đã chọn ${chosen}` : ', chưa trả lời'}${isFlagged ? ', cần xem lại' : ''}`}
                  >
                    {q.number}
                  </button>
                  {labels.map((l) => {
                    const dot = [
                      'dot',
                      chosen === l ? (review && l !== q.answer ? 'bad' : 'on') : '',
                      review && l === q.answer ? 'key' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return canAnswer ? (
                      // tabIndex -1: one tab stop per row (the number); answering by keyboard happens in the question itself
                      <button
                        type="button"
                        tabIndex={-1}
                        className={dot}
                        key={l}
                        aria-pressed={chosen === l}
                        aria-label={`Câu ${q.number}: chọn ${l}`}
                        onClick={() => onAnswer!(q.id, l)}
                      >
                        {l}
                      </button>
                    ) : (
                      <span className={dot} key={l} aria-hidden="true">
                        {l}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
