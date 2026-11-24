import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, formatClock, questionsOf, scopeMinutes, setsInScope } from '../lib/exam';
import { clearDraft, loadDraft } from '../lib/storage';
import type { Scope } from '../lib/types';
import NotFound from './NotFound';

const SCOPES: Scope[] = ['full', 'listening', 'reading'];

export default function TestIntro() {
  const { testId } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const test = data.tests.find((t) => t.id === testId);
  if (!test) return <NotFound />;

  const parts = [1, 2, 3, 4, 5, 6, 7]
    .map((p) => ({ p, n: test.sets.filter((s) => s.part === p).reduce((s, x) => s + x.questions.length, 0) }))
    .filter((x) => x.n);

  const start = (scope: Scope, fresh: boolean) => {
    if (fresh) clearDraft(test.id, scope);
    navigate(`/de/${test.id}/lam-bai/${scope}`);
  };

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <Link to="/" className="small">
          Danh sách đề
        </Link>
        <h1>{test.title}</h1>
        <p>
          {test.test_type === 'full'
            ? `Đề đầy đủ ${test.question_count} câu, đúng số câu từng phần như đề thi thật. Làm cả bài trong ${scopeMinutes(test, 'full')} phút, hoặc làm riêng phần Nghe hay phần Đọc.`
            : `Đề rút gọn ${test.question_count} câu, đủ cả 7 phần. Hợp để kiểm tra nhanh trình độ trước khi làm đề đầy đủ.`}
        </p>
      </div>

      <section>
        <h2 style={{ marginBottom: 18 }}>Chọn phần muốn làm</h2>
        <ul className="toc">
          {SCOPES.map((scope) => {
            const count = questionsOf(setsInScope(test, scope)).length;
            const draft = loadDraft(test.id, scope);
            const done = draft ? Object.keys(draft.answers).length : 0;
            return (
              <li key={scope}>
                <div className="toc__row">
                  <span className="toc__num">{count} câu</span>
                  <span>
                    <span className="toc__title">{SCOPE_NAMES[scope]}</span>
                    <br />
                    <span className="toc__desc">
                      {draft
                        ? `Bài đang làm dở: ${done} câu đã trả lời, còn ${formatClock(draft.remainingSec)}.`
                        : `Thời gian ${scopeMinutes(test, scope)} phút.`}
                    </span>
                  </span>
                  <span className="row" style={{ justifyContent: 'flex-end' }}>
                    {draft && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => start(scope, true)}>
                        Làm lại từ đầu
                      </button>
                    )}
                    <button type="button" className={`btn btn--small ${scope === 'full' ? 'btn--ink' : ''}`} onClick={() => start(scope, false)}>
                      {draft ? 'Làm tiếp' : 'Bắt đầu'}
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 18 }}>Đề này gồm</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Phần</th>
              <th scope="col">Dạng bài</th>
              <th scope="col">Số câu</th>
            </tr>
          </thead>
          <tbody>
            {parts.map(({ p, n }) => (
              <tr key={p}>
                <td>Part {p}</td>
                <td>{PART_NAMES[p]}</td>
                <td>{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section prose">
        <h2>Trước khi bắt đầu</h2>
        <p>
          Bật loa hoặc đeo tai nghe. Phần Nghe có audio cho từng nhóm câu và tự phát khi bạn chuyển sang nhóm mới. Ở Part 1 và Part 2, các lựa chọn chỉ có trong audio, giống đề thật.
        </p>
        <p>
          Bài làm được lưu tự động trên trình duyệt này. Bạn có thể thoát và làm tiếp sau. Khi hết giờ, bài sẽ tự nộp. TOEIC không trừ điểm câu sai, nên đừng bỏ trống câu nào.
        </p>
      </section>
    </div>
  );
}
