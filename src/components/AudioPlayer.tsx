import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { assetUrl } from '../lib/data';
import { formatClock } from '../lib/exam';

const SPEEDS = [1, 1.25, 0.75];
const KEY_STEP_SEC = 5;

interface Props {
  src?: string | null;
  autoPlay?: boolean;
  label: string;
  /** duration from the database, used until the browser reports the real one */
  durationHint?: number | null;
  /** real-exam mode: no seeking, no pausing, no speed change */
  locked?: boolean;
  /** pause while true (e.g. a dialog is open); in locked mode playback resumes when it turns false */
  suspended?: boolean;
  /** when set, audio that has not started yet (no autoplay, or autoplay blocked) shows one big start button with this text */
  startLabel?: string;
  onEnded?: () => void;
  className?: string;
}

export function AudioPlayer({
  src,
  autoPlay = false,
  label,
  durationHint,
  locked = false,
  suspended = false,
  startLabel,
  onEnded,
  className,
}: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(false); // this src has played at least once
  const [blocked, setBlocked] = useState(false); // the browser refused autoplay
  const [time, setTime] = useState(0);
  const [reported, setReported] = useState(0);
  const duration = reported || durationHint || 0;
  const onDuration = (d: number) => {
    if (Number.isFinite(d) && d > 0) setReported(d);
  };
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const rate = locked ? 1 : speed;

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const resumeAfterSuspend = useRef(false);

  // A newly loaded media resource starts at defaultPlaybackRate, so set both, and again on loadedmetadata.
  const applyRate = (a: HTMLAudioElement) => {
    a.defaultPlaybackRate = rateRef.current;
    a.playbackRate = rateRef.current;
  };

  useEffect(() => {
    setTime(0);
    setReported(0);
    setPlaying(false);
    setEnded(false);
    setStarted(false);
    setBlocked(false);
    setFailed(false);
    const a = ref.current;
    if (!a) return;
    applyRate(a);
    if (autoPlay)
      a.play().catch((e: unknown) => {
        // the browser may block autoplay until the learner clicks something
        if (e instanceof DOMException && e.name === 'NotAllowedError') setBlocked(true);
      });
  }, [src, autoPlay]);

  useEffect(() => {
    if (ref.current) applyRate(ref.current);
  }, [rate]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (suspended) {
      resumeAfterSuspend.current = !a.paused;
      a.pause();
    } else if (resumeAfterSuspend.current) {
      resumeAfterSuspend.current = false;
      // free mode: the learner presses play again; real-exam mode has no play/pause, so continue
      if (locked) a.play().catch(() => {});
    }
  }, [suspended, locked]);

  if (!src) return <div className="player player--missing">Câu này chưa có audio.</div>;

  const play = () => {
    const a = ref.current;
    if (!a) return;
    a.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'NotSupportedError') setFailed(true);
    });
  };
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) play();
    else if (!locked) a.pause();
  };
  // Seek from the element's real position, so the slider and clock always match currentTime.
  const seekTo = (t: number) => {
    const a = ref.current;
    if (!a) return;
    const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
    const next = Math.max(0, Math.min(max, t));
    a.currentTime = next;
    setTime(next);
  };
  const onTrackKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const a = ref.current;
    if (!a || e.altKey || e.ctrlKey || e.metaKey) return;
    const now = a.currentTime;
    const big = Math.max(KEY_STEP_SEC, duration / 10);
    const target =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? now - KEY_STEP_SEC
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? now + KEY_STEP_SEC
      : e.key === 'PageDown' ? now - big
      : e.key === 'PageUp' ? now + big
      : e.key === 'Home' ? 0
      : e.key === 'End' ? duration
      : null;
    if (target === null) return;
    e.preventDefault();
    seekTo(target);
  };

  const sync = (a: HTMLAudioElement) => setTime(a.currentTime);
  const showStart = !!startLabel && !started && !playing && (!autoPlay || blocked) && !failed;
  const playDisabled = locked && (playing || ended);

  return (
    <div className={className}>
      <audio
        ref={ref}
        src={assetUrl(src)}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          setEnded(false);
          setBlocked(false);
        }}
        onPause={(e) => {
          setPlaying(false);
          sync(e.currentTarget);
        }}
        onEnded={(e) => {
          setPlaying(false);
          setEnded(true);
          sync(e.currentTarget);
          onEndedRef.current?.();
        }}
        onTimeUpdate={(e) => sync(e.currentTarget)}
        onSeeking={(e) => sync(e.currentTarget)}
        onSeeked={(e) => sync(e.currentTarget)}
        onLoadedMetadata={(e) => {
          applyRate(e.currentTarget);
          onDuration(e.currentTarget.duration);
        }}
        onDurationChange={(e) => onDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <div className="player player--missing">Không phát được file audio này.</div>
      ) : showStart ? (
        <button type="button" className="player-start" onClick={play}>
          <span className="player-start__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 16 16">
              <path d="M4 2.5v11a.6.6 0 0 0 .9.5l9-5.5a.6.6 0 0 0 0-1l-9-5.5a.6.6 0 0 0-.9.5z" fill="currentColor" />
            </svg>
          </span>
          {startLabel}
        </button>
      ) : (
        <div className={`player${locked ? ' player--locked' : ''}`} role="group" aria-label={label}>
          <button
            type="button"
            className="player__play"
            onClick={toggle}
            disabled={playDisabled}
            aria-label={locked ? (playing ? 'Đang phát' : ended ? 'Đã phát xong' : 'Phát') : playing ? 'Tạm dừng' : 'Phát'}
          >
            {playing ? (
              locked ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 6h2.5l3-3v10l-3-3H2zM10 5.5a3.5 3.5 0 0 1 0 5M11.8 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                  <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                </svg>
              )
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
            step="any"
            value={Math.min(time, duration || time)}
            disabled={locked}
            aria-label={locked ? 'Tiến độ phát' : 'Vị trí phát'}
            aria-valuetext={`${formatClock(time)} trên ${formatClock(duration)}`}
            onKeyDown={onTrackKey}
            onChange={(e) => seekTo(Number(e.target.value))}
          />
          <span className="player__time">
            {formatClock(time)} / {formatClock(duration)}
          </span>
          {!locked && (
            <button
              type="button"
              className="player__speed"
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
              aria-label={`Tốc độ phát ${speed} lần, bấm để đổi`}
            >
              {speed}×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
