import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, formatClock, grade, levelFor, setsInScope } from '../lib/exam';
import { deleteAttempt, getAttempt } from '../lib/storage';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';

type Filter = 'wrong' | 'all';

export default function ResultPage() {
  const { attemptId } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('wrong');
  const attempt = attemptId ? getAttempt(attemptId) : undefined;
  const test = attempt && data.tests.find((t) => t.id === attempt.testId);

  if (!attempt || !test)
    return (
      <div className="page page--narrow">
        <div className="empty">
          <strong>Không tìm thấy kết quả này.</strong>
          <span>Kết quả chỉ được lưu trên trình duyệt đã dùng để làm bài.</span>
          <Link className="btn btn--small" to="/">
            Về danh sách đề
          </Link>
        </div>
      </div>
    );

  const r = grade(data, test, attempt.scope, attempt.answers);
  const level = r.total !== null ? levelFor(data, r.total) : undefined;
  const estimated = test.test_type !== 'full';
  const sets = setsInScope(test, attempt.scope);
  const isMiss = (qid: string, key: string) => attempt.answers[qid] !== key;
  const shown = filter === 'all' ? sets : sets.filter((s) => s.questions.some((q) => isMiss(q.id, q.answer)));
  const wrongCount = r.count - r.correct;

  return (
    <div className="page">
      <div className="page-head">
        <Link to={`/de/${test.id}`} className="small">
          {test.title}
        </Link>
        <h1 className="visually-hidden">Kết quả {test.title}</h1>
      </div>

      <section className="score" aria-label="Điểm">
        <div>
          <div className="score__total">{r.total ?? r.sections[0].scaled}</div>
          <div className="score__of">/ {r.total !== null ? 990 : 495} điểm</div>
        </div>
        <div className="stack">
          <div className="score__sections">
            {r.sections.map((s) => (
              <div key={s.section}>
                <span className="muted small">{s.section === 'listening' ? 'Nghe' : 'Đọc'}</span>
                <strong>{s.scaled}</strong>
                <span className="small muted">
                  đúng {s.correct}/{s.total}
                </span>
              </div>
            ))}
            <div>
              <span className="muted small">Thời gian làm</span>
              <strong>{formatClock(attempt.elapsedSec)}</strong>
              <span className="small muted">{SCOPE_NAMES[attempt.scope]}</span>
            </div>
          </div>
          {level && (
            <p>
              <strong>
                {level.label_vi} ({level.cefr})
              </strong>
              <span className="muted">: {level.description_vi}</span>
            </p>
          )}
          <p className="small muted">
            {estimated
              ? 'Đề rút gọn: điểm được quy đổi theo tỷ lệ câu đúng nên chỉ mang tính ước lượng.'
              : 'Điểm quy đổi theo bảng ước tính; điểm thi thật còn phụ thuộc độ khó từng đề.'}
          </p>
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 18 }}>Theo từng phần</h2>
        <div className="part-bars">
          {r.byPart.map((p) => (
            <div className="part-bar" key={p.part}>
              <span>
                <strong>Part {p.part}</strong> <span className="muted">{PART_NAMES[p.part]}</span>
              </span>
              <div className="part-bar__track" aria-hidden="true">
                <div className="part-bar__fill" style={{ width: `${(p.correct / p.total) * 100}%` }} />
              </div>
              <span className="small" style={{ textAlign: 'right' }}>
                {p.correct}/{p.total}
              </span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 24 }}>
          <Link className="btn btn--ink" to={`/de/${test.id}`}>
            Làm lại đề này
          </Link>
          {r.byPart
            .filter((p) => p.correct / p.total < 0.6)
            .slice(0, 2)
            .map((p) => (
              <Link key={p.part} className="btn btn--ghost" to={`/luyen-tap/part-${p.part}`}>
                Luyện thêm Part {p.part}
              </Link>
            ))}
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 12 }}>Xem lại bài làm</h2>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className="tab" aria-selected={filter === 'wrong'} onClick={() => setFilter('wrong')}>
            Câu sai và bỏ trống ({wrongCount})
          </button>
          <button type="button" role="tab" className="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
            Tất cả ({r.count})
          </button>
        </div>
        {shown.length === 0 && (
          <div className="empty" style={{ marginTop: 16 }}>
            <strong>Bạn trả lời đúng tất cả các câu.</strong>
            <span>Chọn “Tất cả” để đọc lại giải thích.</span>
          </div>
        )}
        {shown.map((set) => (
          <article className="review-set" key={set.id}>
            <span className="part-tag">
              Part {set.part}
              <span className="muted" style={{ fontWeight: 500 }}>
                {PART_NAMES[set.part]}
              </span>
            </span>
            <Stimulus set={set} showTranscript />
            <div>
              {set.questions
                .filter((q) => filter === 'all' || isMiss(q.id, q.answer))
                .map((q) => (
                  <QuestionBlock key={q.id} q={q} part={set.part} mode="review" selected={attempt.answers[q.id]} />
                ))}
            </div>
          </article>
        ))}
      </section>

      <p className="section small">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            if (window.confirm('Xóa kết quả này khỏi trình duyệt? Không thể khôi phục.')) {
              deleteAttempt(attempt.id);
              navigate('/');
            }
          }}
        >
          Xóa kết quả này
        </button>
      </p>
    </div>
  );
}
