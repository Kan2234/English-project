import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PART_NAMES, SCOPE_NAMES, examTests, formatClock, grade, levelFor, sectionOfPart, setsInScope } from '../lib/exam';
import { deleteAttempt, getAttempt } from '../lib/storage';
import type { Section } from '../lib/types';
import { Stimulus } from '../components/Stimulus';
import { QuestionBlock } from '../components/QuestionBlock';
import '../styles/study.css';

type Filter = 'wrong' | 'all';

// ETS mapping of TOEIC Listening & Reading section scores to CEFR (minimum score
// per level). Source: ETS Global, "Mapping Table: TOEIC Listening and Reading
// test scores and the CEFR levels" (2025). ETS presents these as guidelines.
const CEFR_CUTS: Record<Section, [string, number][]> = {
  listening: [['C1', 490], ['B2', 400], ['B1', 275], ['A2', 110], ['A1', 60]],
  reading: [['C1', 455], ['B2', 385], ['B1', 275], ['A2', 115], ['A1', 60]],
};
const BELOW_A1 = 'Dưới A1';
const BANDS = ['C1', 'B2', 'B1', 'A2', 'A1', BELOW_A1];
function cefrFor(section: Section, scaled: number): string {
  return CEFR_CUTS[section].find(([, min]) => scaled >= min)?.[0] ?? BELOW_A1;
}

const SECTION_NAMES: Record<Section, string> = { listening: 'Nghe', reading: 'Đọc' };

// Advice by CEFR band, in BANDS order (A1 and below A1 share the last text).
const ADVICE: Record<Section, string[]> = {
  listening: [
    'Phần nghe đã ở mức rất cao. Giữ phong độ bằng cách làm đề đầy đủ theo thời gian thật và rà lại từng câu còn sai để không mất điểm vì mất tập trung.',
    'Nền tảng nghe đã tốt; điểm mất thường nằm ở câu suy luận và câu hỏi ý định người nói của Part 3–4. Xem lại từng câu sai để biết mình nghe sót, mắc bẫy từ lặp hay chưa nhận ra cách nói đồng nghĩa.',
    'Tập trung vào Part 3 và Part 4: đọc trước câu hỏi và gạch chân từ khóa trước khi audio bắt đầu. Đáp án đúng thường diễn đạt lại ý trong bài nghe, nên hãy luyện nhận ra cách nói đồng nghĩa thay vì chờ nghe lại đúng từ.',
    'Luyện chắc Part 2: nắm từ để hỏi (Who, When, Where…) ngay đầu câu và cảnh giác với lựa chọn lặp lại âm của câu hỏi. Ở Part 1, học các động từ chỉ hành động và giới từ chỉ vị trí thường gặp.',
    'Bắt đầu với Part 1 và Part 2: nghe từng câu, dừng lại và nhắc lại thành tiếng. Mỗi ngày nghe 15–20 phút, rồi bật lời thoại để đối chiếu những chỗ chưa nghe ra.',
  ],
  reading: [
    'Phần đọc đã ở mức rất cao. Giữ phong độ bằng cách làm đề đúng thời gian và đọc kỹ các câu suy luận, câu hỏi có NOT ở Part 7.',
    'Điểm mất thường ở câu suy luận, câu chèn câu và bài nhiều văn bản của Part 7. Luyện đối chiếu thông tin giữa các văn bản, và cố làm xong Part 5–6 trong khoảng 20 phút để dành thời gian cho Part 7.',
    'Luyện Part 6 và Part 7: đọc cả câu trước và sau chỗ trống để chọn từ nối và câu phù hợp. Với câu hỏi chi tiết, đọc câu hỏi trước rồi dò nhanh từ khóa trong bài thay vì đọc hết từ đầu.',
    'Ưu tiên Part 5: nhận diện từ loại qua vị trí trong câu và hậu tố (-tion, -ive, -ly), ôn giới từ, liên từ và đại từ. Mỗi ngày học thêm từ vựng chủ đề công sở để đọc Part 7 nhanh hơn.',
    'Bắt đầu với Part 5: ôn từ loại (danh từ, động từ, tính từ, trạng từ) và các thì cơ bản. Đọc chậm các đoạn ngắn ở Part 7 và tra hết từ mới, sau đó đọc lại một lần không tra từ.',
  ],
};
const adviceFor = (section: Section, cefr: string) => ADVICE[section][Math.min(BANDS.indexOf(cefr), 4)];

// Readable names for the question tags that exist in the data; unknown tags fall back to the raw tag.
const KIND: Record<string, string> = {
  action: 'Mô tả hành động',
  'object-position': 'Vị trí đồ vật',
  scenery: 'Tranh phong cảnh',
  paraphrase: 'Nhận ra cách nói đồng nghĩa',
  indirect: 'Lời đáp gián tiếp',
  choice: 'Câu hỏi lựa chọn',
  statement: 'Câu trần thuật',
  'negative-question': 'Câu hỏi phủ định',
  'tag-question': 'Câu hỏi đuôi',
  'yes-no': 'Câu hỏi Yes/No',
  'embedded-question': 'Câu hỏi gián tiếp',
  opinion: 'Hỏi ý kiến',
  permission: 'Xin phép',
  request: 'Lời yêu cầu',
  suggestion: 'Lời gợi ý',
  offer: 'Lời đề nghị giúp',
  where: 'Câu hỏi Where',
  when: 'Câu hỏi When',
  who: 'Câu hỏi Who',
  why: 'Câu hỏi Why',
  which: 'Câu hỏi Which',
  how: 'Câu hỏi How',
  'how-long': 'Câu hỏi How long',
  'how-much': 'Câu hỏi How much',
  'how-many': 'Câu hỏi How many',
  detail: 'Câu hỏi chi tiết',
  'main-idea': 'Ý chính',
  purpose: 'Mục đích',
  problem: 'Vấn đề được nêu',
  'next-action': 'Việc sắp làm',
  'speaker-intent': 'Ý định người nói',
  'speaker-identity': 'Người nói là ai',
  'three-speakers': 'Hội thoại 3 người',
  location: 'Địa điểm',
  graphic: 'Đọc biểu đồ, bảng',
  inference: 'Suy luận',
  intent: 'Ý định người viết',
  synonym: 'Từ đồng nghĩa',
  'not-question': 'Câu hỏi NOT',
  'sentence-insertion': 'Chọn hoặc chèn câu',
  'cross-reference': 'Liên kết nhiều văn bản',
};
const GRAMMAR: Record<string, string> = {
  'word-form': 'từ loại',
  'verb-form': 'dạng động từ',
  'verb-tense': 'thì động từ',
  'present-perfect': 'hiện tại hoàn thành',
  'past-perfect': 'quá khứ hoàn thành',
  passive: 'câu bị động',
  'passive-perfect': 'bị động thì hoàn thành',
  adverb: 'trạng từ',
  preposition: 'giới từ',
  conjunction: 'liên từ',
  'conjunction-vs-preposition': 'liên từ hay giới từ',
  'paired-conjunction': 'liên từ cặp',
  'conjunctive-adverb': 'trạng từ liên kết',
  'relative-clause': 'mệnh đề quan hệ',
  pronoun: 'đại từ',
  comparative: 'so sánh',
  gerund: 'danh động từ (V-ing)',
  infinitive: 'động từ nguyên mẫu (to V)',
  participle: 'phân từ',
  conditional: 'câu điều kiện',
  modal: 'động từ khuyết thiếu',
  inversion: 'đảo ngữ',
  subjunctive: 'thể giả định',
  'subject-verb-agreement': 'hòa hợp chủ ngữ – động từ',
};
const VOCAB: Record<string, string> = {
  collocation: 'kết hợp từ',
  office: 'văn phòng',
  contracts: 'hợp đồng',
  produce: 'nông sản',
  shopping: 'mua sắm',
  business: 'kinh doanh',
  recruitment: 'tuyển dụng',
};
const TRAP: Record<string, string> = { 'putting-on-vs-wearing': 'putting on hay wearing' };

function tagLabel(tag: string): string {
  const i = tag.indexOf(':');
  if (i < 0) return tag;
  const prefix = tag.slice(0, i);
  const rest = tag.slice(i + 1);
  const part = /^part([1-7])$/.exec(prefix);
  if (part && KIND[rest]) return `${KIND[rest]} (Part ${part[1]})`;
  if (prefix === 'grammar' && GRAMMAR[rest]) return `Ngữ pháp: ${GRAMMAR[rest]}`;
  if (prefix === 'vocab' && VOCAB[rest]) return `Từ vựng: ${VOCAB[rest]}`;
  if (prefix === 'trap' && TRAP[rest]) return `Bẫy: ${TRAP[rest]}`;
  return tag;
}

const TAGS_SHOWN = 8;

export default function ResultPage() {
  const { attemptId } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('wrong');
  const [allTags, setAllTags] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const attempt = attemptId ? getAttempt(attemptId) : undefined;
  // Only timed exams have results; an attempt naming a practice bank (tampered storage) is not one.
  const test = attempt && examTests(data).find((t) => t.id === attempt.testId);

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

  const sectionLevels = r.sections.map((s) => {
    const cefr = cefrFor(s.section, s.scaled);
    // parts of this section with a wrong or unanswered question, weakest first; ties keep the part order
    const weakParts = r.byPart
      .filter((p) => sectionOfPart(p.part) === s.section && p.correct < p.total)
      .sort((a, b) => a.correct / a.total - b.correct / b.total);
    return { ...s, cefr, advice: adviceFor(s.section, cefr), weakParts };
  });
  const listening = sectionLevels.find((s) => s.section === 'listening');
  const reading = sectionLevels.find((s) => s.section === 'reading');

  // Questions grouped by type tag, weakest first (then the types with more questions).
  const tagMap = new Map<string, { correct: number; total: number }>();
  for (const q of sets.flatMap((s) => s.questions))
    for (const tag of q.tags ?? []) {
      const t = tagMap.get(tag) ?? { correct: 0, total: 0 };
      t.total += 1;
      if (attempt.answers[q.id] === q.answer) t.correct += 1;
      tagMap.set(tag, t);
    }
  const tags = [...tagMap]
    .map(([tag, t]) => ({ tag, label: tagLabel(tag), ...t, ratio: t.correct / t.total }))
    .sort((a, b) => a.ratio - b.ratio || b.total - a.total || a.label.localeCompare(b.label, 'vi'));
  const tagsShown = allTags ? tags : tags.slice(0, TAGS_SHOWN);

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
            {sectionLevels.map((s) => (
              <div key={s.section}>
                <span className="muted small">{SECTION_NAMES[s.section]}</span>
                <strong>{s.scaled}</strong>
                <span className="small muted">
                  đúng {s.correct}/{s.total} · ≈ {s.cefr}
                </span>
              </div>
            ))}
            <div>
              <span className="muted small">Thời gian làm</span>
              <strong>{formatClock(attempt.elapsedSec)}</strong>
              <span className="small muted">{SCOPE_NAMES[attempt.scope]}</span>
            </div>
          </div>
          {listening && reading && r.total !== null && (
            <p className="study-total">
              Tổng: Nghe <strong>{listening.scaled}</strong> + Đọc <strong>{reading.scaled}</strong> ={' '}
              <strong>{r.total}</strong>/990
            </p>
          )}
          {level ? (
            <p>
              <strong>
                {level.label_vi} ({level.cefr})
              </strong>
              <span className="muted">: {level.description_vi}</span>
            </p>
          ) : (
            sectionLevels.length === 1 && (
              <p>
                <strong>
                  Trình độ phần {SECTION_NAMES[sectionLevels[0].section]}: khoảng {sectionLevels[0].cefr}
                </strong>
                <span className="muted"> (ước tính theo bảng quy đổi CEFR của ETS cho từng kỹ năng)</span>
              </p>
            )
          )}
          <p className="small muted">
            {estimated
              ? 'Đề rút gọn: điểm được quy đổi theo tỷ lệ câu đúng nên chỉ mang tính ước lượng.'
              : 'Điểm quy đổi theo bảng ước tính; điểm thi thật còn phụ thuộc độ khó từng đề.'}
          </p>
        </div>
      </section>

      <section className="section">
        <h2>Trình độ theo từng kỹ năng</h2>
        <div className="study-levels">
          {sectionLevels.map((s) => (
            <article className="study-level" key={s.section}>
              <div className="study-level__head">
                <h3>
                  {SECTION_NAMES[s.section]} · {s.scaled}/495
                </h3>
                <span>
                  <span className="study-level__cefr">{s.cefr}</span> <span className="small muted">ước tính</span>
                </span>
              </div>
              <p>{s.advice}</p>
              {s.weakParts.length > 0 ? (
                <>
                  <p className="muted">
                    Yếu nhất trong bài này: Part {s.weakParts[0].part} ({PART_NAMES[s.weakParts[0].part]}), đúng{' '}
                    {s.weakParts[0].correct}/{s.weakParts[0].total} câu.
                  </p>
                  <div className="row">
                    {s.weakParts.slice(0, 2).map((p) => (
                      <Link key={p.part} className="btn btn--small btn--ghost" to={`/luyen-tap/part-${p.part}`}>
                        Luyện thêm Part {p.part}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <p className="study-perfect">
                  Bạn làm đúng cả {s.total} câu phần {SECTION_NAMES[s.section]}. Hãy thử sức với một đề khác để giữ phong độ.
                </p>
              )}
            </article>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 16 }}>
          Bậc CEFR ước tính theo bảng ánh xạ điểm từng kỹ năng của ETS (Nghe: A1 từ 60, A2 từ 110, B1 từ 275, B2 từ 400,
          C1 từ 490; Đọc: A1 từ 60, A2 từ 115, B1 từ 275, B2 từ 385, C1 từ 455).
        </p>
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
        </div>
      </section>

      {tags.length > 0 && (
        <section className="section">
          <h2 style={{ marginBottom: 8 }}>Theo dạng câu hỏi</h2>
          <p className="small muted" style={{ marginBottom: 18 }}>
            Dạng làm kém nhất xếp trước. Dạng chỉ có 1–2 câu trong bài thì chỉ nên xem để tham khảo.
          </p>
          <div className="part-bars study-tags">
            {tagsShown.map((t) => (
              <div className={`part-bar${t.ratio < 0.5 ? ' is-weak' : ''}`} key={t.tag}>
                <span title={t.tag}>{t.label}</span>
                <div className="part-bar__track" aria-hidden="true">
                  <div className="part-bar__fill" style={{ width: `${t.ratio * 100}%` }} />
                </div>
                <span className="small" style={{ textAlign: 'right' }}>
                  {t.correct}/{t.total}
                </span>
              </div>
            ))}
          </div>
          {tags.length > TAGS_SHOWN && (
            <p className="small" style={{ marginTop: 14 }}>
              <button type="button" className="link-btn" onClick={() => setAllTags((v) => !v)}>
                {allTags ? 'Thu gọn' : `Xem tất cả ${tags.length} dạng`}
              </button>
            </p>
          )}
        </section>
      )}

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

      <div className="section study-reset">
        {confirmDelete ? (
          <div className="study-confirm" role="group" aria-label="Xác nhận xóa kết quả">
            <p>
              <strong>Xóa kết quả này khỏi trình duyệt?</strong> <span className="muted">Không thể khôi phục.</span>
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn--small btn--ink"
                onClick={() => {
                  deleteAttempt(attempt.id);
                  // replace: Back must not land on this deleted result
                  navigate('/', { replace: true });
                }}
              >
                Xóa kết quả
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setConfirmDelete(false)}>
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link-btn small" onClick={() => setConfirmDelete(true)}>
            Xóa kết quả này
          </button>
        )}
      </div>
    </div>
  );
}
