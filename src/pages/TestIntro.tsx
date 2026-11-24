import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, formatClock, questionsOf, scopeMinutes, setsInScope, ADVANCE_SEC, type ExamStart } from '../lib/exam';
import { clearDraft, loadDraft } from '../lib/storage';
import { clearMeta, loadMeta } from '../lib/flags';
import type { Scope } from '../lib/types';
import NotFound from './NotFound';

const SCOPES: Scope[] = ['full', 'listening', 'reading'];
const isScope = (v: unknown): v is Scope => v === 'full' || v === 'listening' || v === 'reading';

export default function TestIntro() {
  const { testId } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [strict, setStrict] = useState(false);
  const test = data.tests.find((t) => t.id === testId);
  // set by the exam page when its URL was opened without pressing "Bắt đầu" here
  const needStart = typeof state === 'object' && state !== null && isScope((state as Record<string, unknown>).needStart)
    ? ((state as Record<string, unknown>).needStart as Scope)
    : null;
  if (!test) return <NotFound />;

  const parts = [1, 2, 3, 4, 5, 6, 7]
    .map((p) => ({ p, n: test.sets.filter((s) => s.part === p).reduce((s, x) => s + x.questions.length, 0) }))
    .filter((x) => x.n);

  const start = (scope: Scope, fresh: boolean) => {
    if (fresh) {
      clearDraft(test.id, scope);
      clearMeta(test.id, scope);
    }
    const startState: ExamStart = { start: true, strict };
    navigate(`/de/${test.id}/lam-bai/${scope}`, { state: startState });
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

      {needStart && (
        <p className="notice" role="status" style={{ marginBottom: 28 }}>
          Bài “{SCOPE_NAMES[needStart]}” chưa bắt đầu. Chọn chế độ rồi bấm “Bắt đầu”, đồng hồ chỉ chạy từ lúc đó.
        </p>
      )}

      <section>
        <fieldset className="mode-pick">
          <legend>Chế độ phần Nghe</legend>
          <label className={`mode-pick__opt${!strict ? ' is-on' : ''}`}>
            <input type="radio" name="listen-mode" checked={!strict} onChange={() => setStrict(false)} />
            <span>
              <strong>Luyện tự do</strong>
              <span className="mode-pick__desc">Được tua, tạm dừng, đổi tốc độ audio và tự chuyển nhóm.</span>
            </span>
          </label>
          <label className={`mode-pick__opt${strict ? ' is-on' : ''}`}>
            <input type="radio" name="listen-mode" checked={strict} onChange={() => setStrict(true)} />
            <span>
              <strong>Chế độ thi thật</strong>
              <span className="mode-pick__desc">Audio phát một lượt: không tua, không dừng, không đổi tốc độ. Hết audio sẽ tự sang nhóm sau {ADVANCE_SEC} giây.</span>
            </span>
          </label>
          <p className="small muted">Chế độ áp dụng khi bắt đầu bài mới. Bài đang làm dở giữ chế độ đã chọn lúc bắt đầu.</p>
        </fieldset>

        <h2 style={{ marginBottom: 18 }}>Chọn phần muốn làm</h2>
        <ul className="toc">
          {SCOPES.map((scope) => {
            const count = questionsOf(setsInScope(test, scope)).length;
            const draft = loadDraft(test.id, scope);
            const done = draft ? Object.keys(draft.answers).length : 0;
            const draftStrict = draft ? !!loadMeta(test.id, scope, draft.startedAt)?.strict : false;
            return (
              <li key={scope}>
                <div className="toc__row">
                  <span className="toc__num">{count} câu</span>
                  <span>
                    <span className="toc__title">{SCOPE_NAMES[scope]}</span>
                    <br />
                    <span className="toc__desc">
                      {draft
                        ? `Bài đang làm dở${draftStrict ? ' (thi thật)' : ''}: ${done} câu đã trả lời, còn ${formatClock(draft.remainingSec)}.`
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
          Bật loa hoặc đeo tai nghe. Phần Nghe có audio cho từng nhóm câu: bấm nút bắt đầu ở nhóm đầu tiên, các nhóm sau tự phát khi bạn chuyển sang. Ở Part 1 và Part 2, các lựa chọn chỉ có trong audio, giống đề thật.
        </p>
        <p>
          Bài làm được lưu tự động trên trình duyệt này. Bạn có thể thoát và làm tiếp sau. Khi hết giờ, bài sẽ tự nộp. TOEIC không trừ điểm câu sai, nên đừng bỏ trống câu nào.
        </p>
      </section>
    </div>
  );
}
