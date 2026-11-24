import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useData } from '../../lib/data';
import { SCOPE_NAMES, examTests, grade } from '../../lib/exam';
import { listAttempts } from '../../lib/storage';
import type { Scope } from '../../lib/types';

// Score history: total and section scores of the latest attempts on one 0–990 axis
// (all three are TOEIC points). Inline SVG sized to its container in real pixels,
// so the text stays legible at 375px. Hover/arrow keys show one attempt; the text
// summary and the table carry every value without hovering.

interface Point {
  id: string;
  finishedAt: number;
  title: string;
  scope: Scope;
  estimate: boolean;
  total: number | null;
  listening: number | null;
  reading: number | null;
}
type SeriesKey = 'total' | 'listening' | 'reading';
const SERIES: { key: SeriesKey; name: string }[] = [
  { key: 'total', name: 'Tổng' },
  { key: 'listening', name: 'Nghe' },
  { key: 'reading', name: 'Đọc' },
];
const MAX_POINTS = 10;
const Y_MAX = 990;
const TICKS = [0, 250, 500, 750, 990];
const H = 210; // svg height, x-axis band included
const PAD = { top: 12, right: 42, bottom: 26, left: 34 };

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateShort = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
};
const dateLong = (ts: number) => new Date(ts).toLocaleDateString('vi-VN');

function Marker({ kind, x, y, r }: { kind: SeriesKey; x: number; y: number; r: number }) {
  const cls = `sc__mark sc__mark--${kind}`;
  if (kind === 'listening') return <rect className={cls} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} />;
  if (kind === 'reading') {
    const d = r * 1.3;
    return <path className={cls} d={`M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z`} />;
  }
  return <circle className={cls} cx={x} cy={y} r={r} />;
}

function pointText(p: Point): string {
  const vals = SERIES.filter((s) => p[s.key] !== null).map((s) => `${s.name} ${p[s.key]}`);
  return `${dateLong(p.finishedAt)}, ${p.title} (${SCOPE_NAMES[p.scope]}): ${vals.join(', ')}.`;
}

function summary(points: Point[]): string {
  const parts: string[] = [];
  const totals = points.filter((p) => p.total !== null);
  if (totals.length >= 2) {
    const a = totals[0].total!;
    const b = totals[totals.length - 1].total!;
    const d = b - a;
    parts.push(`Tổng điểm từ ${a} ${d > 0 ? `lên ${b} (+${d})` : d < 0 ? `xuống ${b} (${d})` : `giữ nguyên ${b}`} qua ${totals.length} bài làm cả hai phần.`);
  }
  const last = points[points.length - 1];
  const lastVals = SERIES.filter((s) => last[s.key] !== null).map((s) => `${s.name} ${last[s.key]}`);
  parts.push(`Bài mới nhất (${dateLong(last.finishedAt)}): ${lastVals.join(', ')}.`);
  const bestTotal = Math.max(...totals.map((p) => p.total!));
  if (totals.length >= 3) parts.push(`Cao nhất ${bestTotal}.`);
  return parts.join(' ');
}

export function ScoreHistory() {
  const data = useData();
  const points = useMemo<Point[]>(() => {
    const out: Point[] = [];
    const exams = examTests(data); // attempts naming a practice bank (tampered storage) are skipped
    for (const a of listAttempts()) {
      const test = exams.find((t) => t.id === a.testId);
      if (!test) continue;
      const r = grade(data, test, a.scope, a.answers);
      const sec = (k: 'listening' | 'reading') => r.sections.find((s) => s.section === k)?.scaled ?? null;
      out.push({ id: a.id, finishedAt: a.finishedAt, title: test.title, scope: a.scope, estimate: test.test_type !== 'full', total: r.total, listening: sec('listening'), reading: sec('reading') });
      if (out.length === MAX_POINTS) break;
    }
    return out.reverse(); // oldest first, left to right
  }, [data]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth || 320);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [active, setActive] = useState<number | null>(null);
  // The point picked by the pointerdown that is about to focus the plot. On touch,
  // pointerleave (which clears `active`) fires before focus, so onFocus restores it
  // instead of falling back to the newest attempt (the keyboard default).
  const pressed = useRef<number | null>(null);
  const summaryId = useId();

  if (points.length < 2) return null;

  const n = points.length;
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i * plotW) / (n - 1);
  const y = (v: number) => PAD.top + plotH * (1 - v / Y_MAX);
  // x labels: as many dates as fit (about 44px each), always the newest
  const every = Math.max(1, Math.ceil((n * 44) / plotW));
  const showLabel = (i: number) => i === n - 1 || ((n - 1 - i) % every === 0 && n - 1 - i >= every * 0.75);

  // direct labels on the newest value of each series, skipped when they would collide
  const endLabels: { key: SeriesKey; v: number; yy: number }[] = [];
  for (const s of SERIES) {
    const last = [...points].reverse().find((p) => p[s.key] !== null);
    if (!last || last !== points[n - 1]) continue;
    const yy = y(last[s.key]!);
    if (endLabels.every((l) => Math.abs(l.yy - yy) >= 13)) endLabels.push({ key: s.key, v: last[s.key]!, yy });
  }

  const nearest = (clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    return Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / plotW) * (n - 1))));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => setActive(nearest(e.clientX));
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (document.activeElement !== wrapRef.current) pressed.current = i;
    setActive(i);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? n - 1;
        if (e.key === 'Home') return 0;
        if (e.key === 'End') return n - 1;
        return Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
      });
    } else if (e.key === 'Escape') setActive(null);
  };
  const ap = active !== null ? points[active] : null;
  const ax = active !== null ? x(active) : 0;
  const anyEstimate = points.some((p) => p.estimate);

  return (
    <figure className="sc">
      <figcaption className="sc__head">
        <span className="sc__title">Điểm {n} bài gần nhất</span>
        <span className="sc__legend" aria-hidden="true">
          {SERIES.map((s) => (
            <span key={s.key} className="sc__key">
              <svg width="22" height="12" viewBox="0 0 22 12">
                <line className={`sc__line sc__line--${s.key}`} x1="1" y1="6" x2="21" y2="6" />
                <Marker kind={s.key} x={11} y={6} r={3.5} />
              </svg>
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>
      <p id={summaryId} className="sc__summary small muted">
        {summary(points)}
        {anyEstimate && ' Điểm đề rút gọn chỉ là ước tính.'}
      </p>

      <div
        ref={wrapRef}
        className="sc__plot"
        tabIndex={0}
        role="group"
        aria-label="Biểu đồ điểm. Dùng phím mũi tên trái, phải để xem từng bài."
        aria-describedby={summaryId}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={() => document.activeElement !== wrapRef.current && setActive(null)}
        onFocus={() => {
          const tapped = pressed.current;
          pressed.current = null;
          setActive((a) => tapped ?? a ?? n - 1);
        }}
        onBlur={() => {
          pressed.current = null;
          setActive(null);
        }}
        onKeyDown={onKey}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {TICKS.map((t) => (
            <g key={t}>
              <line className="sc__grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
              <text className="sc__tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            showLabel(i) ? (
              <text key={p.id} className="sc__tick" x={x(i)} y={H - 8} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} dx={i === n - 1 ? 6 : i === 0 ? -6 : 0}>
                {dateShort(p.finishedAt)}
              </text>
            ) : null,
          )}
          {ap && <line className="sc__cross" x1={ax} x2={ax} y1={PAD.top} y2={PAD.top + plotH} />}
          {SERIES.map((s) => {
            const pts = points.map((p, i) => (p[s.key] === null ? null : ([x(i), y(p[s.key]!)] as const))).filter((v) => v !== null);
            return (
              <g key={s.key}>
                {pts.length > 1 && <polyline className={`sc__line sc__line--${s.key}`} points={pts.map(([a, b]) => `${a},${b}`).join(' ')} />}
                {points.map((p, i) => (p[s.key] === null ? null : <Marker key={p.id} kind={s.key} x={x(i)} y={y(p[s.key]!)} r={active === i ? 5 : 4} />))}
              </g>
            );
          })}
          {endLabels.map((l) => (
            <text key={l.key} className="sc__end" x={x(n - 1) + 9} y={l.yy} dy="0.32em">
              {l.v}
            </text>
          ))}
        </svg>
        {ap && (
          <div
            className="sc__tip"
            style={ax > width / 2 ? { right: width - ax + 10 } : { left: ax + 10 }}
          >
            <span className="sc__tip-head">
              {dateLong(ap.finishedAt)} · {ap.title}
              {ap.scope !== 'full' && ` (${SCOPE_NAMES[ap.scope].toLowerCase()})`}
            </span>
            {SERIES.filter((s) => ap[s.key] !== null).map((s) => (
              <span key={s.key} className="sc__tip-row">
                <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true">
                  <line className={`sc__line sc__line--${s.key}`} x1="1" y1="4" x2="13" y2="4" />
                </svg>
                <strong>{ap[s.key]}</strong> {s.name}
              </span>
            ))}
          </div>
        )}
        <span className="visually-hidden" aria-live="polite">
          {ap ? pointText(ap) : ''}
        </span>
      </div>

      <details className="sc__table">
        <summary className="small">Xem dạng bảng</summary>
        <div className="sc__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Đề</th>
                <th scope="col">Tổng</th>
                <th scope="col">Nghe</th>
                <th scope="col">Đọc</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.id}>
                  <td>{dateLong(p.finishedAt)}</td>
                  <td>
                    {p.title}
                    {p.scope !== 'full' && <span className="muted"> ({SCOPE_NAMES[p.scope].toLowerCase()})</span>}
                  </td>
                  <td>{p.total ?? '–'}</td>
                  <td>{p.listening ?? '–'}</td>
                  <td>{p.reading ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
