import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useGuitarTrainer } from '../hooks/useGuitarTrainer';
import type { GuitarBeatRecord } from '../hooks/useGuitarTrainer';
import './GuitarMode.css';

// ─── Icons ────────────────────────────────────────────────────────────────────
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const ResetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-4" />
  </svg>
);

// ─── Grade helper — matches App.css colour class names ─────────────────────
function getGrade(error: number, perfectWindow: number): { label: string; cls: string } {
  const abs = Math.abs(error);
  if (abs <= perfectWindow)       return { label: 'PERFECT', cls: 'error-perfect' };
  if (abs <= perfectWindow * 1.5) return { label: 'GREAT',   cls: 'error-great'   };
  if (abs <= perfectWindow * 2.5) return { label: 'GOOD',    cls: 'error-good'    };
  return { label: error > 0 ? 'LATE' : 'EARLY', cls: 'error-miss' };
}

// ─── Metronome pendulum ───────────────────────────────────────────────────────
function MetronomeBar({ bpm, active }: { bpm: number; active: boolean }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setProgress(0); return; }
    const beatMs = (60 / bpm) * 1000;

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      setProgress(((ts - startRef.current!) % beatMs) / beatMs);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
  }, [active, bpm]);

  // Swing –40° → +40°
  const angle = Math.sin(progress * Math.PI) * 80 - 40;

  return (
    <div className="gm-metro-wrap">
      <div className="gm-metro-arc">
        <div className="gm-metro-needle" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="gm-metro-center" />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GuitarMode(): React.ReactElement {
  const {
    bpm,
    perfectWindow,
    micActive,
    activeSession,
    permissionDenied,
    currentNote,
    lastBeat,
    beats,
    startMicrophone,
    stopMicrophone,
    resetSession,
  } = useGuitarTrainer();

  const [flash, setFlash] = useState(false);
  const flashRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lastBeat) return;
    setFlash(true);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = window.setTimeout(() => setFlash(false), 200);
  }, [lastBeat]);

  const currentNoteStr = currentNote ? `${currentNote.note}${currentNote.octave}` : null;
  const centsRounded   = currentNote ? Math.round(currentNote.cents) : 0;
  const centStr        = currentNote ? `${centsRounded > 0 ? '+' : ''}${centsRounded}¢` : null;

  const lastGrade = useMemo(
    () => lastBeat ? getGrade(lastBeat.error, perfectWindow) : null,
    [lastBeat, perfectWindow]
  );

  const stats = useMemo(() => {
    const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    beats.forEach(b => {
      const g = getGrade(b.error, perfectWindow);
      if (g.label === 'PERFECT')         counts.perfect++;
      else if (g.label === 'GREAT')      counts.great++;
      else if (g.label === 'GOOD')       counts.good++;
      else                               counts.miss++;
    });
    return counts;
  }, [beats, perfectWindow]);

  return (
    <div className={`gm-root ${flash ? 'gm-flash' : ''}`}>

      {/* ── Permission error ── */}
      {permissionDenied && (
        <div className="gm-permission-err">
          🎙️ Microphone access denied — please allow mic access and try again.
        </div>
      )}

      {/* ── Main content ── */}
      <div className="gm-main">

        {/* Pendulum */}
        <MetronomeBar bpm={bpm} active={activeSession} />

        {/* Live note */}
        <div className="gm-live-note">
          <div className={`gm-note-name ${currentNoteStr ? 'active' : ''}`}>
            {currentNoteStr ?? '···'}
          </div>
          {currentNote && (
            <div className="gm-note-sub">
              <span className="gm-freq">{currentNote.frequency.toFixed(1)} Hz</span>
              <span className={`gm-cents ${Math.abs(centsRounded) < 15 ? 'in-tune' : ''}`}>{centStr}</span>
            </div>
          )}
        </div>

        {/* Grade / feedback */}
        {activeSession ? (
          lastBeat ? (
            <div className="gm-grade-block">
              <div className={`gm-grade-label ${lastGrade!.cls}`}>{lastGrade!.label}</div>
              <div className={`gm-grade-ms ${lastGrade!.cls}`}>
                {lastBeat.error > 0 ? '+' : ''}{lastBeat.error.toFixed(1)} ms
              </div>
            </div>
          ) : (
            <div className="gm-grade-block">
              <div className="gm-waiting">🎸 Play to the beat…</div>
            </div>
          )
        ) : (
          <div className="gm-grade-block">
            <div className="gm-instruction">PRESS START</div>
            <div className="gm-sub-instruction">Play your guitar in time with the metronome</div>
          </div>
        )}

        {/* Buttons */}
        <div className="gm-controls">
          {!micActive ? (
            <button className="gm-btn gm-btn--start" onClick={startMicrophone}>
              <MicIcon /> Start
            </button>
          ) : (
            <>
              <button className="gm-btn gm-btn--stop" onClick={stopMicrophone}>
                <StopIcon /> Stop
              </button>
              <button className="gm-btn gm-btn--reset" onClick={resetSession}>
                <ResetIcon /> Reset
              </button>
            </>
          )}
        </div>

        {/* Stats */}
        {beats.length > 0 && (
          <div className="gm-stats">
            {([
              { label: 'PERFECT', val: stats.perfect, cls: 'error-perfect' },
              { label: 'GREAT',   val: stats.great,   cls: 'error-great'   },
              { label: 'GOOD',    val: stats.good,    cls: 'error-good'    },
              { label: 'MISS',    val: stats.miss,    cls: 'error-miss'    },
            ] as const).map(s => (
              <div key={s.label} className="gm-stat">
                <div className={`gm-stat-val ${s.cls}`}>{s.val}</div>
                <div className="gm-stat-lbl">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── History ── */}
      {beats.length > 0 && (
        <div className="gm-history" onPointerDown={e => e.stopPropagation()}>
          <div className="gm-history-hdr">History</div>
          <div className="gm-history-list">
            {beats.slice().reverse().map((b: GuitarBeatRecord, i: number) => {
              const g = getGrade(b.error, perfectWindow);
              return (
                <div key={i} className={`gm-history-item ${g.cls}`}>
                  <span className="gm-hi-beat">#{beats.length - i}</span>
                  <span className="gm-hi-note">{b.note ?? '—'}</span>
                  <span className={`gm-hi-grade ${g.cls}`}>{g.label}</span>
                  <span className={`gm-hi-ms ${g.cls}`}>
                    {b.error > 0 ? '+' : ''}{b.error.toFixed(1)} ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
