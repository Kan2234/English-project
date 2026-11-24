import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, grade, scopeMinutes } from '../lib/exam';
import { listAttempts } from '../lib/storage';
import type { Label } from '../lib/types';
import { QuestionBlock } from '../components/QuestionBlock';

function TryOneQuestion() {
  const data = useData();
  const pool = useMemo(
    () => data.tests.flatMap((t) => t.sets.filter((s) => s.part === 5).flatMap((s) => s.questions)),
    [data],
  );
  const [index, setIndex] = useState(() => Math.floor(Math.random() * pool.length));
  const [picked, setPicked] = useState<Label | undefined>();
  const q = pool[index];
  if (!q) return null;

  return (
    <div className="try">
      <span className="try__label">Thử một câu Part 5</span>
      <QuestionBlock q={{ ...q, number: 1 }} part={5} mode="practice" selected={picked} revealed={!!picked} onSelect={setPicked} />
      <div className="try__foot">
        <span className="small muted">{picked ? 'Mỗi câu trong đề đều có giải thích như thế này.' : 'Chọn một đáp án để xem giải thích.'}</span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            setIndex((i) => (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length);
            setPicked(undefined);
          }}
        >
          Câu khác
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const data = useData();
  const attempts = listAttempts().slice(0, 6);
  const full = data.tests.find((t) => t.test_type === 'full') ?? data.tests[0];
  const totalQuestions = data.tests.reduce((s, t) => s + t.question_count, 0);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero__text">
          <h1>Luyện TOEIC như đang ngồi trong phòng thi.</h1>
          <p>
            {totalQuestions} câu theo đúng cấu trúc 7 phần, có audio phần Nghe, chấm điểm theo thang 990 và giải thích từng câu bằng tiếng Việt.
          </p>
          <div className="row">
            <Link className="btn btn--ink" to={`/de/${full.id}`}>
              Làm {full.title}
            </Link>
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
          {data.tests.map((t) => (
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
              const count = data.tests.reduce((s, t) => s + t.sets.filter((x) => x.part === p).reduce((n, x) => n + x.questions.length, 0), 0);
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
          {attempts.length === 0 ? (
            <div className="empty">
              <span>Bạn chưa nộp bài nào. Làm thử Mini Test để biết mình đang ở mức nào.</span>
              {data.tests.find((t) => t.test_type === 'mini') && (
                <Link className="btn btn--small" to={`/de/${data.tests.find((t) => t.test_type === 'mini')!.id}`}>
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
