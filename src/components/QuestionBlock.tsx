import type { Label, Question } from '../lib/types';

export type Mode = 'exam' | 'practice' | 'review';

interface Props {
  q: Question;
  part: number;
  mode: Mode;
  selected?: Label;
  onSelect?: (label: Label) => void;
  /** practice: reveal the key + explanation once answered */
  revealed?: boolean;
  /** exam: show a "flag for review" toggle when onToggleFlag is given */
  flagged?: boolean;
  onToggleFlag?: () => void;
  /** exam: this is the question keyboard shortcuts answer */
  current?: boolean;
}

/**
 * One question: number, prompt and a row of answer-sheet bubbles.
 * Part 1–2 choices are only heard in the real test, so their text stays hidden until review.
 */
export function QuestionBlock({ q, part, mode, selected, onSelect, revealed, flagged = false, onToggleFlag, current = false }: Props) {
  const labels = Object.keys(q.choices) as Label[];
  const showKey = mode === 'review' || (mode === 'practice' && revealed);
  const audioOnly = part <= 2 && !showKey;
  const locked = mode === 'review' || (mode === 'practice' && revealed);
  const groupId = `q-${q.id}`;

  const bubbleClass = (l: Label) =>
    ['bubble', showKey && l === q.answer ? 'is-key' : '', showKey && selected === l && l !== q.answer ? 'is-wrong' : '']
      .filter(Boolean)
      .join(' ');

  return (
    <div className={['question', current ? 'is-current' : '', flagged ? 'is-flagged' : ''].filter(Boolean).join(' ')} id={groupId}>
      <div className="question__head">
        <span className="qnum">{q.number}.</span>
        {q.prompt && part !== 6 ? (
          <p className="question__prompt" id={`${groupId}-prompt`}>
            {/* Part 5 blanks are written as ------- in the data */}
            {q.prompt.split(/(-{4,})/).map((chunk, i) =>
              /^-{4,}$/.test(chunk) ? (
                <span key={i} className="blank" aria-label="chỗ trống">
                  {' '}
                </span>
              ) : (
                chunk
              ),
            )}
          </p>
        ) : (
          <p className="muted small" id={`${groupId}-prompt`}>
            {part === 1 && 'Chọn câu mô tả đúng nhất bức ảnh.'}
            {part === 2 && 'Chọn câu đáp lại phù hợp nhất.'}
            {part === 6 && `Chỗ trống số ${q.number} trong đoạn văn.`}
          </p>
        )}
        {onToggleFlag && (
          <button
            type="button"
            className="flag-toggle"
            aria-pressed={flagged}
            aria-label={`Xem lại câu ${q.number}`}
            title={flagged ? 'Bỏ đánh dấu xem lại' : 'Đánh dấu để xem lại'}
            onClick={onToggleFlag}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span>Xem lại</span>
          </button>
        )}
      </div>

      <div
        className={audioOnly ? 'choices choices--inline' : 'choices'}
        role="radiogroup"
        aria-labelledby={`${groupId}-prompt`}
      >
        {labels.map((l) => {
          const checked = selected === l;
          const bubble = (
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={audioOnly ? `Đáp án ${l}` : `${l}. ${q.choices[l]}`}
              className={bubbleClass(l)}
              disabled={locked}
              // in a .choice row the row handles the click (the button's click bubbles up to it)
              onClick={audioOnly ? () => onSelect?.(l) : undefined}
            >
              {l}
            </button>
          );
          if (audioOnly) return <span key={l}>{bubble}</span>;
          return (
            <div key={l} className="choice" onClick={() => !locked && onSelect?.(l)}>
              {bubble}
              <span>{q.choices[l]}</span>
            </div>
          );
        })}
      </div>

      {showKey && (
        <div className="explain" role="status">
          <span className={`explain__verdict ${selected === q.answer ? 'ok' : 'no'}`}>
            {selected === undefined
              ? `Chưa trả lời. Đáp án đúng: ${q.answer}`
              : selected === q.answer
                ? `Đúng: ${q.answer}`
                : `Sai: bạn chọn ${selected}, đáp án đúng là ${q.answer}`}
          </span>
          <span>{q.explanation_vi}</span>
        </div>
      )}
    </div>
  );
}
