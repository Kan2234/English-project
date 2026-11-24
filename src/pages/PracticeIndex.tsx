import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES } from '../lib/exam';
import { loadPractice } from '../lib/storage';

export default function PracticeIndex() {
  const data = useData();
  const progress = loadPractice();

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Luyện theo phần</h1>
        <p>Làm từng nhóm câu của một Part, xem đáp án và giải thích ngay sau khi chọn. Không giới hạn thời gian.</p>
      </div>
      <ul className="toc">
        {[1, 2, 3, 4, 5, 6, 7].map((p) => {
          const qs = data.tests.flatMap((t) => t.sets.filter((s) => s.part === p).flatMap((s) => s.questions));
          const done = qs.filter((q) => q.id in progress).length;
          const right = qs.filter((q) => progress[q.id]).length;
          const part = data.exam_parts.find((x) => x.format_code === 'LR' && x.part_number === p);
          return (
            <li key={p}>
              <Link to={`/luyen-tap/part-${p}`}>
                <span className="toc__num">Part {p}</span>
                <span>
                  <span className="toc__title">{PART_NAMES[p]}</span>
                  <br />
                  <span className="toc__desc">{part?.description_vi}</span>
                </span>
                <span className="toc__meta">
                  {done ? `${right} đúng / ${done} đã làm` : `${qs.length} câu`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
