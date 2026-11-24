import { useData } from '../lib/data';
import { PART_NAMES } from '../lib/exam';
import '../styles/content.css';

export default function InfoPage() {
  const data = useData();
  const lr = data.exam_formats.find((f) => f.code === 'LR');
  const lrParts = data.exam_parts.filter((p) => p.format_code === 'LR');
  const swParts = data.exam_parts.filter((p) => p.format_code === 'SW');

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Về kỳ thi TOEIC</h1>
        <p>{lr?.description_vi}</p>
      </div>

      <section>
        <h2 style={{ marginBottom: 14 }}>Cấu trúc Listening & Reading</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Phần</th>
                <th scope="col">Dạng bài</th>
                <th scope="col">Câu</th>
                <th scope="col">Mô tả</th>
              </tr>
            </thead>
            <tbody>
              {lrParts.map((p) => (
                <tr key={p.part_number}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>Part {p.part_number}</strong>
                    <br />
                    <span className="muted small">{p.section === 'Listening' ? 'Nghe' : 'Đọc'}</span>
                  </td>
                  <td>{PART_NAMES[p.part_number] ?? p.name_vi}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.question_count}
                    <br />
                    <span className="muted small">câu {p.question_range}</span>
                  </td>
                  <td>{p.description_vi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Nghe: 100 câu, khoảng 45 phút. Đọc: 100 câu, 75 phút. Mỗi phần 5–495 điểm, tổng 10–990.
        </p>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Thang điểm và trình độ</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Điểm</th>
              <th scope="col">CEFR</th>
              <th scope="col">Trình độ</th>
            </tr>
          </thead>
          <tbody>
            {data.score_levels.map((l) => (
              <tr key={l.cefr}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {l.min_score}–{l.max_score}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{l.cefr}</td>
                <td>
                  <strong>{l.label_vi}</strong>
                  <br />
                  <span className="muted">{l.description_vi}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted info-note">
          Điểm tổng ở mỗi mốc là tổng hai mốc tối thiểu của Nghe và Đọc (ví dụ B1 = Nghe 275 + Đọc 275).
        </p>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Mẹo làm bài</h2>
        <ul className="rules">
          {[...data.strategies]
            .sort((a, b) => a.order_index - b.order_index)
            .map((s) => (
              <li key={s.title_vi}>
                <strong>
                  {s.part_number ? `Part ${s.part_number}: ` : ''}
                  {s.title_vi}
                </strong>
                <span className="muted">{s.content_vi}</span>
              </li>
            ))}
        </ul>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>TOEIC Speaking & Writing</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Kỹ năng</th>
              <th scope="col">Dạng bài</th>
              <th scope="col">Câu</th>
            </tr>
          </thead>
          <tbody>
            {swParts.map((p) => (
              <tr key={p.section + p.part_number}>
                <td>{p.section === 'Speaking' ? 'Nói' : 'Viết'}</td>
                <td>
                  <strong>{p.name_vi}</strong>
                  <br />
                  <span className="muted">{p.description_vi}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{p.question_range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
