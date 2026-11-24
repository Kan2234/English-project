import { useData } from '../lib/data';
import { PART_NAMES } from '../lib/exam';

const vnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';
const CANDIDATE: Record<string, string> = { student: 'Học sinh, sinh viên', general: 'Thí sinh tự do' };

export default function InfoPage() {
  const data = useData();
  const lr = data.exam_formats.find((f) => f.code === 'LR');
  const lrParts = data.exam_parts.filter((p) => p.format_code === 'LR');
  const swParts = data.exam_parts.filter((p) => p.format_code === 'SW');
  const sourceName = (id: string) => data.sources.find((s) => s.id === id);
  const updates = [...data.updates].sort((a, b) => a.date.localeCompare(b.date));

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
                <td>{l.cefr}</td>
                <td>
                  <strong>{l.label_vi}</strong>
                  <br />
                  <span className="muted">{l.description_vi}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Lệ phí thi tại Việt Nam</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Bài thi</th>
              <th scope="col">Đối tượng</th>
              <th scope="col">Lệ phí</th>
            </tr>
          </thead>
          <tbody>
            {data.fees.map((f, i) => (
              <tr key={i}>
                <td>{f.format_code === 'LR' ? 'Nghe – Đọc' : 'Nói – Viết'}</td>
                <td>{CANDIDATE[f.candidate_type] ?? f.candidate_type}</td>
                <td>
                  {vnd(f.amount)} {!f.verified && <span className="flag">chưa xác nhận</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="notice" style={{ marginTop: 12 }}>
          Mức phí lấy từ nguồn tham khảo bên ngoài, chưa đối chiếu với IIG Việt Nam. Kiểm tra lại trên{' '}
          <a href="https://iigvietnam.com/policies-and-announcements/announcements/" target="_blank" rel="noreferrer">
            trang thông báo của IIG
          </a>{' '}
          trước khi đăng ký.
        </p>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Mốc thay đổi 2025–2026</h2>
        <ol className="timeline">
          {updates.map((u) => {
            const src = sourceName(u.source_id);
            return (
              <li key={u.date + u.title_vi}>
                <time dateTime={u.date}>{new Date(u.date).toLocaleDateString('vi-VN')}</time>
                <div className="stack" style={{ gap: 4 }}>
                  <strong>
                    {u.title_vi} {u.verified ? <span className="flag flag--ok">nguồn chính thức</span> : <span className="flag">chưa xác nhận</span>}
                  </strong>
                  <span className="muted">{u.summary_vi}</span>
                  {src && (
                    <a className="small" href={src.url} target="_blank" rel="noreferrer">
                      {src.name}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
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

      <section className="section">
        <h2 style={{ marginBottom: 14 }}>Nguồn tham khảo</h2>
        <ul className="traps">
          {data.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              {s.note_vi && <span className="muted small"> {s.note_vi}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
