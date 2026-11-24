import { useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { loadLearned, toggleLearned } from '../lib/storage';
import type { Vocabulary } from '../lib/types';

export const TOPIC_NAMES: Record<string, string> = {
  office: 'Văn phòng',
  recruitment: 'Tuyển dụng',
  finance: 'Tài chính',
  marketing: 'Marketing',
  travel: 'Du lịch',
  shopping: 'Mua sắm',
  logistics: 'Kho vận',
  manufacturing: 'Sản xuất',
  contracts: 'Hợp đồng',
  events: 'Sự kiện',
  health: 'Sức khỏe',
  'real-estate': 'Bất động sản',
  technology: 'Công nghệ',
  dining: 'Ăn uống',
};

const POS_VI: Record<string, string> = { noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ', phrase: 'cụm từ' };

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
function speak(text: string) {
  if (!canSpeak) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

const keyOf = (v: Vocabulary) => `${v.word}|${v.pos}|${v.topic}`;

export default function VocabPage() {
  const data = useData();
  const [topic, setTopic] = useState<string | null>(null);
  const [level, setLevel] = useState('all');
  const [query, setQuery] = useState('');
  const [hideMeaning, setHideMeaning] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [learned, setLearned] = useState(loadLearned);
  const [onlyNew, setOnlyNew] = useState(false);

  const topics = useMemo(() => [...new Set(data.vocabulary.map((v) => v.topic))], [data]);
  const words = data.vocabulary.filter((v) => {
    const q = query.trim().toLowerCase();
    return (
      (!topic || v.topic === topic) &&
      (level === 'all' || v.level === level) &&
      (!onlyNew || !learned.has(keyOf(v))) &&
      (!q || v.word.toLowerCase().includes(q) || v.meaning_vi.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Từ vựng TOEIC</h1>
        <p>
          {data.vocabulary.length} từ thường gặp trong đề, chia theo chủ đề và mức điểm mục tiêu. Bạn đã thuộc {learned.size} từ.
        </p>
      </div>

      <div className="filters">
        <input
          className="input"
          type="search"
          placeholder="Tìm từ hoặc nghĩa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm từ vựng"
        />
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Mức điểm mục tiêu">
          <option value="all">Mọi mức điểm</option>
          <option value="450">Mục tiêu 450</option>
          <option value="650">Mục tiêu 650</option>
          <option value="850">Mục tiêu 850+</option>
        </select>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={hideMeaning} onChange={(e) => (setHideMeaning(e.target.checked), setRevealed(new Set()))} />
          Ẩn nghĩa để tự kiểm tra
        </label>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Chỉ hiện từ chưa thuộc
        </label>
      </div>
      <div className="chips" style={{ marginBottom: 24 }} role="group" aria-label="Chủ đề">
        <button type="button" className="chip" aria-pressed={topic === null} onClick={() => setTopic(null)}>
          Tất cả
        </button>
        {topics.map((t) => (
          <button type="button" key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>
            {TOPIC_NAMES[t] ?? t}
          </button>
        ))}
      </div>

      {words.length === 0 ? (
        <div className="empty">
          <span>Không có từ nào khớp bộ lọc. Thử bỏ bớt điều kiện tìm kiếm.</span>
        </div>
      ) : (
        <ul className="words">
          {words.map((v) => {
            const k = keyOf(v);
            const hidden = hideMeaning && !revealed.has(k);
            return (
              <li className="word" key={k}>
                <div className="word__head">
                  <span className="word__term">{v.word}</span>
                  <span className="word__ipa">
                    {v.ipa} <span className="small">({POS_VI[v.pos] ?? v.pos})</span>
                  </span>
                </div>
                <div className="word__body">
                  {hidden ? (
                    <button type="button" className="word__meaning is-hidden" style={{ border: 0, font: 'inherit', textAlign: 'left', fontWeight: 600 }} onClick={() => setRevealed((s) => new Set(s).add(k))} aria-label={`Hiện nghĩa của ${v.word}`}>
                      {v.meaning_vi}
                    </button>
                  ) : (
                    <span className="word__meaning">{v.meaning_vi}</span>
                  )}
                  <span className="word__example">{v.example_en}</span>
                  {!hidden && <span className="muted">{v.example_vi}</span>}
                  {v.collocations.length > 0 && <span className="small muted">Hay đi với: {v.collocations.join(', ')}</span>}
                </div>
                <div className="word__actions">
                  {canSpeak && (
                    <button type="button" className="icon-btn" onClick={() => speak(v.word)} aria-label={`Nghe phát âm ${v.word}`}>
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                        <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={learned.has(k)}
                    onClick={() => setLearned(toggleLearned(k))}
                    aria-label={learned.has(k) ? `Bỏ đánh dấu đã thuộc ${v.word}` : `Đánh dấu đã thuộc ${v.word}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
