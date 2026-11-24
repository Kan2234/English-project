import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../lib/data';
import { formatClock } from '../lib/exam';

const SPEEDS = [1, 1.25, 0.75];

interface Props {
  src?: string | null;
  autoPlay?: boolean;
  label: string;
  /** duration from the database, used until the browser reports the real one */
  durationHint?: number | null;
}

export function AudioPlayer({ src, autoPlay = false, label, durationHint }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [reported, setReported] = useState(0);
  const duration = reported || durationHint || 0;
  const onDuration = (d: number) => {
    if (Number.isFinite(d) && d > 0) setReported(d);
  };
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTime(0);
    setReported(0);
    setPlaying(false);
    setFailed(false);
    const a = ref.current;
    if (a && autoPlay) a.play().catch(() => setPlaying(false)); // the browser may block autoplay; the button still works
  }, [src, autoPlay]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  if (!src || failed)
    return <div className="player player--missing">{failed ? 'Không phát được file audio này.' : 'Câu này chưa có audio.'}</div>;

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setFailed(true));
    else a.pause();
  };

  return (
    <div className="player" role="group" aria-label={label}>
      <audio
        ref={ref}
        src={assetUrl(src)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
        onDurationChange={(e) => onDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <button type="button" className="player__play" onClick={toggle} aria-label={playing ? 'Tạm dừng' : 'Phát'}>
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5v11a.6.6 0 0 0 .9.5l9-5.5a.6.6 0 0 0 0-1l-9-5.5a.6.6 0 0 0-.9.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <input
        className="player__track"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={time}
        aria-label="Vị trí phát"
        onChange={(e) => {
          if (ref.current) ref.current.currentTime = Number(e.target.value);
        }}
      />
      <span className="player__time">
        {formatClock(time)} / {formatClock(duration)}
      </span>
      <button
        type="button"
        className="player__speed"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        aria-label={`Tốc độ phát ${speed} lần, bấm để đổi`}
      >
        {speed}×
      </button>
    </div>
  );
}
