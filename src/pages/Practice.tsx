import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES } from '../lib/exam';
import {
  loadPractice,
  loadPracticePosition,
  recordPractice,
  resetPracticePart,
  savePracticePosition,
  wrongInPractice,
} from '../lib/storage';
import type { Answers, Label, QuestionSet, Test } from '../lib/types';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';
import NotFound from './NotFound';
import '../styles/study.css';

type Mode = 'all' | 'wrong';
interface Item {
  set: QuestionSet;
  test: Test;
}

export default function Practice() {
  const { partSlug = '' } = useParams(); // "part-3"
  // Only exactly "part-1" … "part-7"; loose forms like "part-3.0", "part-+5" or a bare "3" are not pages.
  const match = /^part-([1-7])$/.exec(partSlug);
  const part = match ? Number(match[1]) : 0;
  if (!PART_NAMES[part]) return <NotFound />;
  // key: start fresh when moving to another part
  return <PracticeSession key={part} part={part} />;
}

function PracticeSession({ part }: { part: number }) {
  const data = useData();
  const sets = useMemo<Item[]>(
    () => data.tests.flatMap((t) => t.sets.filter((s) => s.part === part).map((s) => ({ set: s, test: t }))),
    [data, part],
  );
  const questionIds = useMemo(() => sets.flatMap((x) => x.set.questions.map((q) => q.id)), [sets]);

  const [progress, setProgress] = useState(loadPractice);
  const [mode, setMode] = useState<Mode>('all');
  // Continue at the set this part was left at (unknown or stale ids start at the first set).
  const [startIndex] = useState(() => {
    const saved = loadPracticePosition(part);
    const i = saved ? sets.findIndex((x) => x.set.id === saved) : -1;
    return i > 0 ? i : 0;
  });
  const [index, setIndex] = useState(startIndex);
  const [resumed, setResumed] = useState(startIndex > 0);
  const [answers, setAnswers] = useState<Answers>({});
  // Wrong-answer mode works on a snapshot taken when it starts, so a question
  // answered right stays on screen (with its explanation) until the learner moves on.
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set());
  const [wrongIndex, setWrongIndex] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<Answers>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const wrongNow = wrongInPractice(questionIds, progress);
  const wrongSets = useMemo(() => sets.filter((x) => x.set.questions.some((q) => wrongIds.has(q.id))), [sets, wrongIds]);

  if (sets.length === 0) return <NotFound />;

  const inWrong = mode === 'wrong';
  const list = inWrong ? wrongSets : sets;
  const at = Math.min(inWrong ? wrongIndex : index, Math.max(list.length - 1, 0));
  const current = list[at];
  const shownAnswers = inWrong ? wrongAnswers : answers;
  const questions = current ? current.set.questions.filter((q) => !inWrong || wrongIds.has(q.id)) : [];
  const allAnswered = questions.every((q) => shownAnswers[q.id]);

  const done = questionIds.filter((id) => id in progress).length;
  const right = questionIds.filter((id) => progress[id]).length;
  const answeredHere = Object.keys(shownAnswers).length;
  const correctHere = sets.flatMap((x) => x.set.questions).filter((q) => shownAnswers[q.id] === q.answer).length;

  const choose = (qid: string, l: Label, key: Label) => {
    if (shownAnswers[qid]) return;
    (inWrong ? setWrongAnswers : setAnswers)((a) => ({ ...a, [qid]: l }));
    recordPractice(qid, l === key);
    setProgress(loadPractice());
  };
  const go = (i: number) => {
    if (inWrong) setWrongIndex(i);
    else {
      setIndex(i);
      savePracticePosition(part, sets[i].set.id);
    }
    setResetDone(false);
    setResumed(false);
    window.scrollTo({ top: 0 });
  };
  const startWrong = () => {
    setWrongIds(new Set(wrongNow));
    setWrongIndex(0);
    setWrongAnswers({});
    setMode('wrong');
    setConfirmReset(false);
    setResetDone(false);
    window.scrollTo({ top: 0 });
  };
  const showAll = () => {
    setMode('all');
    setConfirmReset(false);
    window.scrollTo({ top: 0 });
  };
  const reset = () => {
    resetPracticePart(part, questionIds);
    setProgress(loadPractice());
    setAnswers({});
    setWrongAnswers({});
    setWrongIds(new Set());
    setIndex(0);
    setMode('all');
    setConfirmReset(false);
    setResumed(false);
    setResetDone(true);
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
          {done > 0
            ? `Đã làm ${done}/${questionIds.length} câu của phần này, đúng ${right}.`
            : `Phần này có ${questionIds.length} câu trong ${sets.length} nhóm.`}
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Chế độ luyện">
        <button type="button" role="tab" className="tab" aria-selected={!inWrong} onClick={showAll}>
          Tất cả nhóm ({sets.length})
        </button>
        <button type="button" role="tab" className="tab" aria-selected={inWrong} onClick={startWrong}>
          Luyện lại câu sai ({wrongNow.length})
        </button>
      </div>

      {resetDone && (
        <p className="notice study-gap" role="status">
          Đã xóa tiến độ Part {part}. Bạn bắt đầu lại từ nhóm 1.
        </p>
      )}
      {!inWrong && resumed && (
        <p className="notice study-gap">
          Bạn đang học tiếp từ nhóm {startIndex + 1}.{' '}
          <button type="button" className="link-btn" onClick={() => go(0)}>
            Về nhóm 1
          </button>
        </p>
      )}

      {inWrong && !current ? (
        <div className="empty study-gap">
          <strong>Không còn câu sai nào trong Part {part}.</strong>
          <span>Câu nào bạn trả lời sai khi luyện sẽ được gom vào đây để làm lại.</span>
          <button type="button" className="btn btn--small" onClick={showAll}>
            Luyện tất cả nhóm
          </button>
        </div>
      ) : (
        current && (
          <>
            <p className="muted small study-gap">
              {inWrong ? 'Làm lại câu sai: nhóm' : 'Nhóm'} {at + 1}/{list.length}
              {inWrong
                ? current.set.questions.length > 1 &&
                  ` · ${questions.length}/${current.set.questions.length} câu của nhóm này`
                : `, lấy từ ${current.test.title}`}
              {answeredHere > 0 && ` · Lượt này: đúng ${correctHere}/${answeredHere} câu`}
            </p>

            <Stimulus key={current.set.id} set={current.set} showTranscript={allAnswered} />

            <div style={{ marginTop: 12 }}>
              {questions.map((q) => (
                <QuestionBlock
                  key={q.id}
                  q={q}
                  part={part}
                  mode="practice"
                  selected={shownAnswers[q.id]}
                  revealed={!!shownAnswers[q.id]}
                  onSelect={(l) => choose(q.id, l, q.answer)}
                />
              ))}
            </div>

            <div className="exam__nav">
              <button type="button" className="btn btn--ghost" onClick={() => go(at - 1)} disabled={at === 0}>
                Nhóm trước
              </button>
              {at < list.length - 1 ? (
                <button type="button" className={`btn${allAnswered ? ' btn--ink' : ''}`} onClick={() => go(at + 1)}>
                  {allAnswered ? 'Nhóm tiếp theo' : 'Bỏ qua nhóm này'}
                </button>
              ) : inWrong ? (
                wrongNow.length > 0 ? (
                  <button type="button" className="btn btn--ink" onClick={startWrong}>
                    Làm lại {wrongNow.length} câu còn sai
                  </button>
                ) : (
                  <button type="button" className="btn btn--ink" onClick={showAll}>
                    Xong, về tất cả nhóm
                  </button>
                )
              ) : (
                <Link className="btn btn--ink" to="/luyen-tap">
                  Xong Part {part}
                </Link>
              )}
            </div>
          </>
        )
      )}

      <div className="study-reset">
        {confirmReset ? (
          <div className="study-confirm" role="group" aria-label="Xác nhận xóa tiến độ">
            <p>
              <strong>Xóa tiến độ Part {part}?</strong>{' '}
              <span className="muted">
                Kết quả đã làm, danh sách câu sai và vị trí đang học của phần này sẽ bị xóa. Các Part khác giữ nguyên.
              </span>
            </p>
            <div className="row">
              <button type="button" className="btn btn--small btn--ink" onClick={reset}>
                Xóa tiến độ
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setConfirmReset(false)}>
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link-btn small" onClick={() => setConfirmReset(true)}>
            Xóa tiến độ Part {part}
          </button>
        )}
      </div>
    </div>
  );
}
