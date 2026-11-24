import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { isDue, loadCards, rateCard, schedule, today, vocabKey, type CardState, type Rating } from '../lib/progress';
import type { Vocabulary } from '../lib/types';
import { LEVELS, LEVEL_LABEL, POS_VI, TOPIC_NAMES, canSpeak, speak, withinLevel } from './VocabPage';
import '../styles/content.css';
import '../styles/flashcards.css';

/** New words added to a session at a time. */
const NEW_BATCH = 10;

const RATINGS: { r: Rating; label: string }[] = [
  { r: 1, label: 'Chưa nhớ' },
  { r: 2, label: 'Nhớ mờ' },
  { r: 3, label: 'Nhớ rõ' },
];

function nextIn(prev: CardState | undefined, r: Rating): string {
  const days = schedule(prev, r).due - today();
  if (days <= 0) return 'gặp lại ngay';
  if (days === 1) return 'ngày mai';
  return `${days} ngày nữa`;
}

/** Due cards first (most overdue, then lowest box), then up to `newCount` words never studied. */
function buildQueue(words: Vocabulary[], cards: Map<string, CardState>, newCount: number): string[] {
  const day = today();
  const due = words
    .filter((v) => isDue(cards.get(vocabKey(v)), day))
    .sort((a, b) => {
      const x = cards.get(vocabKey(a))!;
      const y = cards.get(vocabKey(b))!;
      return x.due - y.due || x.box - y.box;
    });
  // easier levels first, data order within a level
  const fresh = words
    .filter((v) => !cards.has(vocabKey(v)))
    .sort((a, b) => Number(a.level) - Number(b.level))
    .slice(0, newCount);
  return [...due, ...fresh].map(vocabKey);
}

function Back({ v }: { v: Vocabulary }) {
  return (
    <>
      <span className="fc__meaning">{v.meaning_vi}</span>
      <span className="fc__example" lang="en">
        {v.example_en}
      </span>
      <span className="muted">{v.example_vi}</span>
      {v.collocations.length > 0 && <span className="small muted">Hay đi với: {v.collocations.join(', ')}</span>}
    </>
  );
}

/** Keys that type text or have their own Space/number behaviour keep it. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, select, textarea, a[href], summary') || (!!target.closest('button') && !target.closest('.fc'));
}

export default function Flashcards() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const topics = useMemo(() => [...new Set(data.vocabulary.map((v) => v.topic))], [data]);
  // unknown values in the URL fall back to "all topics" / the widest level
  const topicParam = params.get('chu-de');
  const topic = topicParam && topics.includes(topicParam) ? topicParam : null;
  const levelParam = params.get('muc') ?? '';
  const level = (LEVELS as readonly string[]).includes(levelParam) ? levelParam : '850';

  const words = useMemo(() => data.vocabulary.filter((v) => (!topic || v.topic === topic) && withinLevel(v, level)), [data, topic, level]);
  const byKey = useMemo(() => new Map(data.vocabulary.map((v) => [vocabKey(v), v])), [data]);

  const [cards, setCards] = useState(loadCards);
  const [queue, setQueue] = useState<string[]>(() => buildQueue(words, cards, NEW_BATCH));
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // a new filter starts a new session for that word list
  const filterKey = `${topic ?? ''}|${level}`;
  const [shownFor, setShownFor] = useState(filterKey);
  if (shownFor !== filterKey) {
    setShownFor(filterKey);
    setQueue(buildQueue(words, cards, NEW_BATCH));
    setFlipped(false);
    setReviewed(0);
  }

  const setFilter = (key: 'chu-de' | 'muc', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const current = queue.length ? byKey.get(queue[0]) : undefined;
  const day = today();
  const dueTotal = words.filter((v) => isDue(cards.get(vocabKey(v)), day)).length;
  const newLeft = words.filter((v) => !cards.has(vocabKey(v)) && !queue.includes(vocabKey(v))).length;
  const studied = words.filter((v) => cards.has(vocabKey(v))).length;
  const dueTomorrow = words.filter((v) => cards.get(vocabKey(v))?.due === day + 1).length;

  const rate = (r: Rating) => {
    if (!current) return;
    const key = queue[0];
    const state = rateCard(key, r);
    setCards((m) => new Map(m).set(key, state));
    // "Chưa nhớ" comes back at the end of this session
    setQueue((q) => (r === 1 ? [...q.slice(1), key] : q.slice(1)));
    setFlipped(false);
    setReviewed((n) => n + 1);
    cardRef.current?.focus({ preventScroll: true });
  };
  const addNew = () => {
    setQueue((q) => [...q, ...buildQueue(words, cards, Number.MAX_SAFE_INTEGER).filter((k) => !cards.has(k) && !q.includes(k)).slice(0, NEW_BATCH)]);
    setFlipped(false);
  };

  // Space flips, 1/2/3 rate once the back is shown
  const keyState = useRef({ flipped, rate, has: !!current });
  keyState.current = { flipped, rate, has: !!current };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || ownsKeys(e.target)) return;
      const s = keyState.current;
      if (!s.has) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (s.flipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        s.rate(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <Link to="/tu-vung" className="small">
          Từ vựng
        </Link>
        <h1>Thẻ từ vựng</h1>
        <p>
          Nhìn từ tiếng Anh, tự nhớ nghĩa rồi lật thẻ. Chấm mức nhớ của bạn: từ chưa nhớ quay lại ngay, từ nhớ rõ cách vài ngày mới gặp lại.
        </p>
      </div>

      <div className="filters fc-filters">
        <select className="select" value={topic ?? ''} onChange={(e) => setFilter('chu-de', e.target.value || null)} aria-label="Chủ đề">
          <option value="">Mọi chủ đề</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {TOPIC_NAMES[t] ?? t}
            </option>
          ))}
        </select>
        <select className="select" value={level} onChange={(e) => setFilter('muc', e.target.value)} aria-label="Mức điểm mục tiêu">
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </div>

      <p className="small muted fc-stats" aria-live="polite">
        {words.length} từ · đã học {studied} · {dueTotal} thẻ đến hạn
        {queue.length > 0 && ` · còn ${queue.length} thẻ trong lượt này`}
      </p>

      {current ? (
        <div className="fc" ref={cardRef} tabIndex={-1} aria-label="Thẻ từ vựng">
          <div className={`fc__card${flipped ? ' is-flipped' : ''}`}>
            <div className="fc__front">
              <span className="fc__tag small muted">
                {TOPIC_NAMES[current.topic] ?? current.topic} · {current.level}
                {!cards.has(queue[0]) && ' · từ mới'}
              </span>
              <span className="fc__word" lang="en">
                {current.word}
              </span>
              <span className="fc__ipa">
                <span lang="en">{current.ipa}</span> <span className="small">({POS_VI[current.pos] ?? current.pos})</span>
                {canSpeak && (
                  <button type="button" className="icon-btn fc__speak" onClick={() => speak(current.word)} aria-label={`Nghe phát âm ${current.word}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                      <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
            {/* an invisible copy of the back keeps its room on the front side, so flipping never moves the buttons */}
            <div className="fc__back">
              <div className="fc__side fc__sizer" aria-hidden="true">
                <Back v={current} />
              </div>
              <div className="fc__side" aria-live="polite">
                {flipped && <Back v={current} />}
              </div>
            </div>
          </div>

          <div className="fc__actions">
            {!flipped ? (
              <button type="button" className="btn btn--ink fc__flip" onClick={() => setFlipped(true)}>
                Lật thẻ <kbd>Space</kbd>
              </button>
            ) : (
              <div className="fc__rate" role="group" aria-label="Bạn nhớ từ này đến đâu?">
                {RATINGS.map(({ r, label }) => (
                  <button key={r} type="button" className={`btn fc__btn fc__btn--${r}`} onClick={() => rate(r)}>
                    <span>
                      {label} <kbd>{r}</kbd>
                    </span>
                    <span className="fc__when">{nextIn(cards.get(queue[0]), r)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="small muted fc__keys">Phím tắt: Space để lật thẻ, 1 / 2 / 3 để chấm.</p>
        </div>
      ) : (
        <div className="empty fc-done">
          <strong>{reviewed > 0 ? `Xong lượt này: bạn đã ôn ${reviewed} lần.` : 'Không còn thẻ nào cần ôn trong bộ lọc này.'}</strong>
          <span>
            {dueTomorrow > 0 ? `Ngày mai có ${dueTomorrow} thẻ đến hạn.` : 'Các thẻ đã học sẽ quay lại khi đến hạn.'}
            {newLeft > 0 ? ` Còn ${newLeft} từ chưa học.` : ''}
          </span>
          <div className="row" style={{ justifyContent: 'center' }}>
            {newLeft > 0 && (
              <button type="button" className="btn btn--ink btn--small" onClick={addNew}>
                Học thêm {Math.min(NEW_BATCH, newLeft)} từ mới
              </button>
            )}
            <Link className="btn btn--ghost btn--small" to="/tu-vung">
              Xem danh sách từ
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
