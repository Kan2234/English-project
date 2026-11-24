import { useId, useState, type ReactNode } from 'react';
import type { Graphic, QuestionSet } from '../lib/types';
import { assetUrl } from '../lib/data';
import { blankNumber } from '../lib/exam';
import { AudioPlayer } from './AudioPlayer';
import '../styles/translate.css';

function GraphicView({ g }: { g: Graphic }) {
  if (g.type === 'bar-chart') {
    const values = g.rows.map((r) => Number(String(r[1]).replace(/[^\d.]/g, '')) || 0);
    const max = Math.max(...values, 1);
    return (
      <figure className="graphic" style={{ margin: 0 }}>
        <figcaption className="graphic__title">{g.title}</figcaption>
        <div className="bars">
          {g.rows.map((r, i) => (
            <div className="bar" key={r[0]}>
              <span>{r[0]}</span>
              <div className="bar__track" aria-hidden="true">
                <div className="bar__fill" style={{ width: `${(values[i] / max) * 100}%` }} />
              </div>
              <span>{r[1]}</span>
            </div>
          ))}
        </div>
      </figure>
    );
  }
  return (
    <figure className="graphic" style={{ margin: 0 }}>
      <figcaption className="graphic__title">{g.title}</figcaption>
      <table>
        <thead>
          <tr>
            {g.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.join('|')}>
              {r.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Replace Part 6 blanks ---(k)--- with a marker that shows the test question number. */
function renderPassage(text: string, set: QuestionSet): ReactNode[] {
  return text.split(/(---\(\d+\)---)/g).map((chunk, i) => {
    const m = chunk.match(/^---\((\d+)\)---$/);
    if (!m) return chunk;
    const n = blankNumber(set, Number(m[1]));
    return (
      <span className="blank" key={i}>
        {n ?? m[1]}
      </span>
    );
  });
}

/** "Xem bản dịch": a disclosure button that reveals the Vietnamese translation below it. */
function Translation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="vi-toggle">
      <button type="button" className="vi-toggle__btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Xem bản dịch
      </button>
      <div id={id} className="vi-panel" lang="vi" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

interface Props {
  set: QuestionSet;
  /** show listening transcript (review / practice after answering) */
  showTranscript?: boolean;
  autoPlay?: boolean;
  /** false: the caller renders the audio player itself (the exam keeps it sticky) */
  withAudio?: boolean;
}

export function Stimulus({ set, showTranscript = false, autoPlay = false, withAudio = true }: Props) {
  const [showPhotoText, setShowPhotoText] = useState(false);
  const listening = set.part <= 4;

  return (
    <div className="stimulus">
      {listening && withAudio && (
        <AudioPlayer src={set.audio_url} autoPlay={autoPlay} durationHint={set.audio_duration_sec} label={`Audio câu ${set.questions[0].number}`} />
      )}

      {set.part === 1 && (
        <div className={set.image_url ? 'photo-frame photo-frame--img' : 'photo-frame'}>
          {set.image_url ? (
            <img src={assetUrl(set.image_url)} alt={set.image_description ?? 'Ảnh của câu hỏi'} />
          ) : showPhotoText || showTranscript ? (
            <p className="photo-frame__caption">{set.image_description}</p>
          ) : (
            <div className="stack" style={{ justifyItems: 'center' }}>
              <span className="muted small">Ảnh cho câu này đang được bổ sung.</span>
              <button type="button" className="link-btn" onClick={() => setShowPhotoText(true)}>
                Xem mô tả ảnh
              </button>
            </div>
          )}
        </div>
      )}
      {set.part === 1 && set.image_url && set.image_credit && (
        <p className="photo-credit">
          Ảnh:{' '}
          <a href={set.image_credit.url} target="_blank" rel="noreferrer">
            {set.image_credit.text}
          </a>
        </p>
      )}

      {set.graphic && <GraphicView g={set.graphic} />}

      {set.passages?.map((p, i) => (
        <div className="booklet" key={i}>
          {p.title && <div className="booklet__title">{p.title}</div>}
          {renderPassage(p.text, set)}
        </div>
      ))}
      {/* translations only after answering (practice) or in review: the same moment the transcript appears */}
      {showTranscript && set.passages?.some((p) => p.text_vi) && (
        <Translation>
          {set.passages.map(
            (p, i) =>
              p.text_vi && (
                <div className="vi-panel__item" key={i}>
                  {set.passages!.length > 1 && p.title && <div className="vi-panel__title">{p.title}</div>}
                  {renderPassage(p.text_vi, set)}
                </div>
              ),
          )}
        </Translation>
      )}

      {listening && showTranscript && set.transcript && (
        <details open={set.part >= 3}>
          <summary className="small muted" style={{ cursor: 'pointer', marginBottom: 8 }}>
            Lời thoại (transcript)
          </summary>
          <p className="transcript">{set.transcript}</p>
          {set.transcript_vi && (
            <Translation>
              <p className="vi-panel__item">{set.transcript_vi}</p>
            </Translation>
          )}
        </details>
      )}
    </div>
  );
}
