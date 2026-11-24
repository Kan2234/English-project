import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, practiceSets } from '../lib/exam';
import { loadPractice, loadPracticePosition, wrongInPractice } from '../lib/storage';
import '../styles/study.css';

// What each part asks of the learner. Real-exam question counts are left out on
// purpose: the site's bank is smaller, and its own counts are shown next to it.
const PART_BLURBS: Record<number, string> = {
  1: 'Nghe 4 câu mô tả một bức ảnh, chọn câu mô tả đúng nhất.',
  2: 'Nghe một câu hỏi hoặc câu nói, chọn lời đáp phù hợp trong 3 lựa chọn.',
  3: 'Nghe hội thoại của 2–3 người, trả lời 3 câu hỏi cho mỗi đoạn.',
  4: 'Nghe một người nói (thông báo, tin nhắn thoại, quảng cáo…), trả lời 3 câu hỏi cho mỗi bài.',
  5: 'Chọn từ hoặc cụm từ điền vào chỗ trống trong câu: ngữ pháp và từ vựng.',
  6: 'Điền từ, cụm từ hoặc cả câu vào chỗ trống trong một đoạn văn.',
  7: 'Đọc email, thông báo, tin nhắn… (một hoặc nhiều văn bản) và trả lời câu hỏi.',
};

export default function PracticeIndex() {
  const data = useData();
  const progress = loadPractice();

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Luyện theo phần</h1>
        <p>
          Làm từng nhóm câu của một Part, xem đáp án và giải thích ngay sau khi chọn. Không giới hạn thời gian; trang nhớ
          nhóm bạn đang học và gom lại các câu làm sai. Câu hỏi ở đây không lấy từ Full Test, nên khi làm đề đầy đủ bạn vẫn
          gặp toàn câu mới.
        </p>
      </div>
      <ul className="toc study-toc">
        {[1, 2, 3, 4, 5, 6, 7].map((p) => {
          // Same pool and order as the practice page: Full Test sets are kept for the timed test.
          const sets = practiceSets(data, p).map((x) => x.set);
          const ids = sets.flatMap((s) => s.questions.map((q) => q.id));
          const done = ids.filter((id) => id in progress).length;
          const right = ids.filter((id) => progress[id]).length;
          const wrong = wrongInPractice(ids, progress).length;
          const savedSet = loadPracticePosition(p);
          const at = savedSet ? sets.findIndex((s) => s.id === savedSet) : -1;
          const size = sets.length === ids.length ? `${ids.length} câu` : `${ids.length} câu · ${sets.length} nhóm`;
          const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
          return (
            <li key={p}>
              <Link to={`/luyen-tap/part-${p}`}>
                <span className="toc__num">Part {p}</span>
                <span>
                  <span className="toc__title">{PART_NAMES[p]}</span>
                  <br />
                  <span className="toc__desc">{PART_BLURBS[p]}</span>
                  {done > 0 && (
                    <span className="study-progress">
                      <span className="study-progress__track" aria-hidden="true">
                        <span className="study-progress__fill" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="small muted">
                        Đã làm {done}/{ids.length} · đúng {right}
                        {wrong > 0 && ` · ${wrong} câu sai cần làm lại`}
                        {at > 0 && ` · đang ở nhóm ${at + 1}`}
                      </span>
                    </span>
                  )}
                </span>
                <span className="toc__meta">{size}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
