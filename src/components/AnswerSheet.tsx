import type { Answers, Label, QuestionSet } from '../lib/types';
import { sectionOfPart } from '../lib/exam';

interface Props {
  sets: QuestionSet[];
  answers: Answers;
  currentSetIndex: number;
  onJump: (setIndex: number) => void;
  /** review: mark the key and wrong answers */
  review?: boolean;
}

/** The answer sheet: every question number with four small bubbles, grouped by section. */
export function AnswerSheet({ sets, answers, currentSetIndex, onJump, review = false }: Props) {
  const rows = sets.flatMap((s, setIndex) => s.questions.map((q) => ({ q, setIndex, part: s.part })));
  const answered = rows.filter((r) => answers[r.q.id]).length;
  const groups = (['listening', 'reading'] as const)
    .map((sec) => ({ sec, rows: rows.filter((r) => sectionOfPart(r.part) === sec) }))
    .filter((g) => g.rows.length);

  return (
    <div className="sheet" aria-label="Phiếu trả lời">
      <div className="sheet__head">
        <span>Phiếu trả lời</span>
        <span>
          {answered}/{rows.length} câu
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.sec}>
          <div className="sheet__section">{g.sec === 'listening' ? 'Listening' : 'Reading'}</div>
          <div className="sheet__grid">
            {g.rows.map(({ q, setIndex }) => {
              const chosen = answers[q.id];
              const labels = Object.keys(q.choices) as Label[];
              return (
                <button
                  type="button"
                  key={q.id}
                  className={`sheet__row${setIndex === currentSetIndex ? ' is-current' : ''}`}
                  onClick={() => onJump(setIndex)}
                  aria-label={`Câu ${q.number}${chosen ? `, đã chọn ${chosen}` : ', chưa trả lời'}`}
                >
                  <span className="sheet__n">{q.number}</span>
                  {labels.map((l) => {
                    const cls = [
                      'dot',
                      chosen === l ? (review && l !== q.answer ? 'bad' : 'on') : '',
                      review && l === q.answer ? 'key' : '',
                    ].join(' ');
                    return (
                      <span className={cls} key={l} aria-hidden="true">
                        {l}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
