import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, examTests, grade, practiceSets, scopeMinutes } from '../lib/exam';
import { listAttempts } from '../lib/storage';
import type { Label, Question } from '../lib/types';
import '../styles/content.css';
import { QuestionBlock } from '../components/QuestionBlock';
import { StudyNext } from './home/StudyNext';
import { ScoreHistory } from './home/ScoreHistory';

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A label that is never the right answer, so the sizer shows the longest verdict ("Sai: bạn chọn …"). */
const wrongLabel = (q: Question): Label => (Object.keys(q.choices) as Label[]).find((l) => l !== q.answer) ?? q.answer;

function TryOneQuestion() {
  const data = useData();
  // Same pool as Part 5 practice: Full Test questions stay unseen for the real timed attempt.
  const pool = useMemo(() => practiceSets(data, 5).flatMap((x) => x.set.questions), [data]);
  // Walk a shuffled deck so "Câu khác" shows every question once before any repeats.
  const [order] = useState(() => shuffled(pool.length));
  const [tried, setTried] = useState(0);
  const [picked, setPicked] = useState<Label | undefined>();
  const q = pool[order[tried % order.length]];
  if (!q) return null;

  return (
    <div className="try">
      <span className="try__label">Thử một câu Part 5</span>
      <div className="try__stage">
        <div className="try__current">
          <QuestionBlock q={q} part={5} mode="practice" selected={picked} revealed={!!picked} onSelect={setPicked} />
          {/* fills the room reserved for the explanation until an answer is picked */}
          {!picked && <div className="try__placeholder small">Chọn một đáp án để xem giải thích.</div>}
        </div>
        {pool.map((s) => (
          <div key={s.id} className="try__sizer" aria-hidden="true" inert>
            <QuestionBlock q={{ ...s, id: `${s.id}-sizer` }} part={5} mode="practice" selected={wrongLabel(s)} revealed />
          </div>
        ))}
      </div>
      <div className="try__foot">
        {/* kept in the layout (just hidden) before an answer is picked, so the footer height never changes */}
        <span className={picked ? 'small muted try__hint' : 'small muted try__hint try__sizer'} aria-hidden={picked ? undefined : true}>
          Mỗi câu trong đề đều có giải thích như thế này.
        </span>
        {pool.length > 1 && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setTried((n) => n + 1);
              setPicked(undefined);
            }}
          >
            Câu khác
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const data = useData();
  const attempts = listAttempts().slice(0, 6);
  // Only Full / Mini tests are exams; the practice bank ("part-drill") lives under /luyen-tap.
  const exams = examTests(data);
  const full = exams.find((t) => t.test_type === 'full') ?? exams[0];
  const mini = exams.find((t) => t.test_type === 'mini');
  const examQuestions = exams.reduce((s, t) => s + t.question_count, 0);
  const drillQuestions = data.tests.filter((t) => t.test_type === 'part-drill').reduce((s, t) => s + t.question_count, 0);

  return (
    <div className="page">
      <StudyNext />

      <section className="hero">
        <div className="hero__text">
          <h1>Luyện TOEIC như đang ngồi trong phòng thi.</h1>
          <p>
            {examQuestions} câu đề thi theo đúng cấu trúc 7 phần, chấm điểm theo thang 990
            {drillQuestions > 0 && `, thêm ${drillQuestions} câu luyện theo phần`}. Phần Nghe có audio, câu nào cũng có giải thích
            bằng tiếng Việt.
          </p>
          <div className="row">
            {full && (
              <Link className="btn btn--ink" to={`/de/${full.id}`}>
                Làm {full.title}
              </Link>
            )}
            <Link className="btn btn--ghost" to="/luyen-tap">
              Luyện từng phần
            </Link>
          </div>
        </div>
        <TryOneQuestion />
      </section>

      <section className="section">
        <h2>Đề thi</h2>
        <ul className="toc">
          {exams.map((t) => (
            <li key={t.id}>
              <Link to={`/de/${t.id}`}>
                <span className="toc__num">{t.question_count} câu</span>
                <span>
                  <span className="toc__title">{t.title}</span>
                  <br />
                  <span className="toc__desc">
                    {t.test_type === 'full' ? 'Đề đầy đủ, đúng số câu từng phần như đề thật.' : 'Đề rút gọn đủ 7 phần, làm trong khoảng một giờ.'}
                  </span>
                </span>
                <span className="toc__meta">{scopeMinutes(t, 'full')} phút</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col section">
        <section>
          <h2 style={{ marginBottom: 18 }}>Luyện theo phần</h2>
          <ul className="toc">
            {[1, 2, 3, 4, 5, 6, 7].map((p) => {
              // the same sets as /luyen-tap (no Full Test questions)
              const count = practiceSets(data, p).reduce((n, x) => n + x.set.questions.length, 0);
              return (
                <li key={p}>
                  <Link to={`/luyen-tap/part-${p}`}>
                    <span className="toc__num">Part {p}</span>
                    <span className="toc__title">{PART_NAMES[p]}</span>
                    <span className="toc__meta">{count} câu</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 style={{ marginBottom: 18 }}>Bài đã làm</h2>
          <ScoreHistory />
          {attempts.length === 0 ? (
            <div className="empty">
              <span>Bạn chưa nộp bài nào. Làm thử Mini Test để biết mình đang ở mức nào.</span>
              {mini && (
                <Link className="btn btn--small" to={`/de/${mini.id}`}>
                  Làm Mini Test
                </Link>
              )}
            </div>
          ) : (
            <ul className="toc">
              {attempts.map((a) => {
                const test = data.tests.find((t) => t.id === a.testId);
                if (!test) return null;
                const r = grade(data, test, a.scope, a.answers);
                return (
                  <li key={a.id}>
                    <Link to={`/ket-qua/${a.id}`}>
                      <span className="toc__num">{r.total ?? r.sections[0].scaled}</span>
                      <span>
                        <span className="toc__title">{test.title}</span>
                        <br />
                        <span className="toc__desc">
                          {SCOPE_NAMES[a.scope]}, đúng {r.correct}/{r.count} câu
                        </span>
                      </span>
                      <span className="toc__meta">{new Date(a.finishedAt).toLocaleDateString('vi-VN')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
