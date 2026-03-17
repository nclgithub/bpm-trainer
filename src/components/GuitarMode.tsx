import React, { useMemo } from 'react';
import { useGuitarTrainer } from '../hooks/useGuitarTrainer';
import { getNoteString, getDeviationIndicator } from '../utils/pitchDetection';
import './GuitarMode.css';

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12"></rect>
  </svg>
);

export function GuitarMode(): React.ReactElement {
  const {
    bpm,
    setBpm,
    micActive,
    currentNote,
    notes,
    activeSession,
    permissionDenied,
    startMicrophone,
    stopMicrophone,
    resetSession,
  } = useGuitarTrainer();

  const inTuneCount = useMemo(() => {
    return notes.filter((n) => n.inTune).length;
  }, [notes]);

  const accuracy = useMemo(() => {
    if (notes.length === 0) return 0;
    return Math.round((inTuneCount / notes.length) * 100);
  }, [notes, inTuneCount]);

  const noteString = getNoteString(currentNote);
  const deviation = currentNote ? getDeviationIndicator(currentNote.cents) : '';
  const cents = currentNote ? Math.round(currentNote.cents) : 0;

  const beatMs = (60 / bpm) * 1000;
  const metronomeWidth = useMemo(() => {
    if (!activeSession) return 0;
    return ((Date.now() % beatMs) / beatMs) * 100;
  }, [activeSession, beatMs]);

  return (
    <div className="guitar-mode">
      <div className="guitar-header">
        <div className="guitar-bpm">
          <div className="bpm-label">BPM</div>
          <input
            type="number"
            className="bpm-input"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value, 10) || 120)}
            min="30"
            max="300"
            disabled={micActive}
          />
        </div>
      </div>

      {permissionDenied && (
        <div className="permission-error">
          <p>Microphone permission denied. Please allow microphone access to use Guitar Mode.</p>
        </div>
      )}

      <div className="guitar-main">
        {!micActive ? (
          <button className="mic-button start" onClick={startMicrophone}>
            <PlayIcon />
            Start Microphone
          </button>
        ) : (
          <button className="mic-button stop" onClick={stopMicrophone}>
            <StopIcon />
            Stop Microphone
          </button>
        )}

        {activeSession && (
          <>
            <div className="metronome-bar">
              <div className={`metronome-beat ${Math.abs(metronomeWidth - 50) < 5 ? 'pulse' : ''}`}></div>
              <div className="metronome-track" style={{ '--progress': `${metronomeWidth}%` } as React.CSSProperties}></div>
            </div>

            <div className="note-display">
              <div className={`note-large ${currentNote ? 'active' : ''}`}>
                {noteString}
              </div>
              {currentNote && (
                <div className="note-info">
                  <div className="frequency">{currentNote.frequency.toFixed(1)} Hz</div>
                  <div className={`tuning ${Math.abs(cents) < 10 ? 'in-tune' : ''}`}>
                    {deviation}
                    {Math.abs(cents)}¢
                  </div>
                </div>
              )}
            </div>

            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-label">Notes Played</div>
                <div className="stat-value">{notes.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">In Tune</div>
                <div className="stat-value">{inTuneCount}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Accuracy</div>
                <div className="stat-value">{accuracy}%</div>
              </div>
            </div>

            <button className="reset-btn" onClick={resetSession}>
              Reset
            </button>
          </>
        )}
      </div>

      {notes.length > 0 && (
        <div className="guitar-history">
          <div className="history-header">Note History</div>
          <div className="history-list">
            {notes
              .slice()
              .reverse()
              .map((noteRecord, idx) => (
                <div key={idx} className={`history-item ${noteRecord.inTune ? 'in-tune' : 'out-of-tune'}`}>
                  <span className="history-note">{noteRecord.note}</span>
                  <span className="history-freq">{noteRecord.frequency?.toFixed(0)} Hz</span>
                  <span className={`history-cents ${Math.abs(noteRecord.cents || 0) < 10 ? 'in-tune' : ''}`}>
                    {noteRecord.cents && noteRecord.cents > 0 ? '+' : ''}
                    {noteRecord.cents?.toFixed(0)}¢
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
