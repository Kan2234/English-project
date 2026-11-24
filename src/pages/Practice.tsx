import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES } from '../lib/exam';
import { recordPractice } from '../lib/storage';
import type { Answers, Label } from '../lib/types';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';
import NotFound from './NotFound';

export default function Practice() {
  const { partSlug = '' } = useParams(); // "part-3"
  const part = Number(partSlug.replace(/^part-/, ''));
  if (!PART_NAMES[part]) return <NotFound />;
  // key: start fresh when moving to another part
  return <PracticeSession key={part} part={part} />;
}

function PracticeSession({ part }: { part: number }) {
  const data = useData();
  const sets = useMemo(
    () => data.tests.flatMap((t) => t.sets.filter((s) => s.part === part).map((s) => ({ set: s, test: t }))),
    [data, part],
  );
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  if (sets.length === 0) return <NotFound />;

  const { set, test } = sets[index];
  const allAnswered = set.questions.every((q) => answers[q.id]);
  const choose = (qid: string, l: Label, key: Label) => {
    if (answers[qid]) return;
    setAnswers((a) => ({ ...a, [qid]: l }));
    recordPractice(qid, l === key);
  };
  const answeredHere = Object.keys(answers).length;
  const correctHere = sets.flatMap((x) => x.set.questions).filter((q) => answers[q.id] === q.answer).length;
  const go = (i: number) => {
    setIndex(i);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <Link to="/luyen-tap" className="small">
          Luyện theo phần
        </Link>
        <h1>
          Part {part}: {PART_NAMES[part]}
        </h1>
        <p>
          Nhóm {index + 1}/{sets.length}, lấy từ {test.title}.
          {answeredHere > 0 && ` Lượt này: đúng ${correctHere}/${answeredHere} câu.`}
        </p>
      </div>

      <Stimulus key={set.id} set={set} showTranscript={allAnswered} />

      <div style={{ marginTop: 12 }}>
        {set.questions.map((q) => (
          <QuestionBlock
            key={q.id}
            q={q}
            part={part}
            mode="practice"
            selected={answers[q.id]}
            revealed={!!answers[q.id]}
            onSelect={(l) => choose(q.id, l, q.answer)}
          />
        ))}
      </div>

      <div className="exam__nav">
        <button type="button" className="btn btn--ghost" onClick={() => go(index - 1)} disabled={index === 0}>
          Nhóm trước
        </button>
        {index < sets.length - 1 ? (
          <button type="button" className={`btn${allAnswered ? ' btn--ink' : ''}`} onClick={() => go(index + 1)}>
            {allAnswered ? 'Nhóm tiếp theo' : 'Bỏ qua nhóm này'}
          </button>
        ) : (
          <Link className="btn btn--ink" to="/luyen-tap">
            Xong Part {part}
          </Link>
        )}
      </div>
    </div>
  );
}
