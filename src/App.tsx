import { useState, useRef, useEffect, useCallback } from 'react';
import { useBpmTrainer } from './hooks/useBpmTrainer';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { TapRecord } from './hooks/useBpmTrainer';
import './App.css';
import { CalibrationTest } from './components/CalibrationTest';
import { RhythmBar } from './components/RhythmBar';
import { GuitarMode } from './components/GuitarMode';

import { initAudio, getAudioContext, playTick } from './utils/audio';

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
);
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [playMetronome, setPlayMetronome] = useLocalStorage('bpm_trainer_metronome_on', false);
  const [bpmInput, setBpmInput] = useLocalStorage('bpm_trainer_bpm_input', '120');
  const [perfectWindowInput, setPerfectWindowInput] = useLocalStorage('bpm_trainer_window_input', '30');
  const [offsetInput, setOffsetInput] = useLocalStorage('bpm_trainer_offset_input', '0');
  const [showVisualFlash, setShowVisualFlash] = useState(false);
  const [showCalibrationTest, setShowCalibrationTest] = useState(false);
  const [showVisualBar, setShowVisualBar] = useLocalStorage('bpm_trainer_visual_bar', false);
  const [playHitsound, setPlayHitsound] = useLocalStorage('bpm_trainer_hitsound_on', true);
  const [playPerformanceSound, setPlayPerformanceSound] = useLocalStorage('bpm_trainer_performance_sound_on', true);

  const flashTimeoutRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatInBarRef = useRef<number>(0);

  const feedbackRef = useRef<(error?: number) => void>(() => {});

  const {
    mode, setMode,
    setBpm,
    timeSignature, setTimeSignature,
    perfectWindow, setPerfectWindow,
    offset, setOffset,
    taps, lastError, detectedBpm,
    activeSession,
    gapClickMode, setGapClickMode,
    gapClickBarsOn, setGapClickBarsOn,
    gapClickBarsOff, setGapClickBarsOff,
    tap, startTime
  } = useBpmTrainer((err: number) => feedbackRef.current(err));

  const handleTapFeedback = useCallback((error?: number) => {
    if (error !== undefined && playPerformanceSound) {
      const absError = Math.abs(error);
      if (absError <= perfectWindow) {
        playTick('perfect_hit');
      } else if (error < 0) {
        playTick('early');
      } else {
        playTick('late');
      }
    } else if (playHitsound) {
      playTick();
    }
    
    setShowVisualFlash(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => setShowVisualFlash(false), 150);
  }, [playHitsound, playPerformanceSound, perfectWindow]);

  useEffect(() => {
    feedbackRef.current = handleTapFeedback;
  }, [handleTapFeedback]);

  useEffect(() => {
    const parsed = parseInt(bpmInput, 10);
    if (!isNaN(parsed) && parsed > 0) setBpm(parsed);
  }, [bpmInput, setBpm]);

  useEffect(() => {
    const parsed = parseInt(perfectWindowInput, 10);
    if (!isNaN(parsed) && parsed >= 0) setPerfectWindow(parsed);
  }, [perfectWindowInput, setPerfectWindow]);

  useEffect(() => {
    const parsed = parseInt(offsetInput, 10);
    if (!isNaN(parsed)) setOffset(parsed);
  }, [offsetInput, setOffset]);

  const handleApplyCalibrationTest = (newOffset: number) => {
    setOffsetInput(newOffset.toString());
    setOffset(newOffset);
    setShowCalibrationTest(false);
    setShowSettings(true); // Keep settings open
  };

  useEffect(() => {
    const handleFirstInteraction = () => { initAudio(); window.removeEventListener('pointerdown', handleFirstInteraction); window.removeEventListener('click', handleFirstInteraction); };
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') initAudio(); };
    window.addEventListener('pointerdown', handleFirstInteraction);
    window.addEventListener('click', handleFirstInteraction);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let timerID: number;
    const scheduler = () => {
      const ctx = getAudioContext();
      if (!ctx || !activeSession || mode !== 'absolute') return;

      // Ensure context is running if possible (scheduler is usually triggered by user interaction)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(e => console.warn('Could not resume audio in scheduler', e));
      }

      // If the scheduler is too far behind (e.g. toggled off and on, or tab was inactive),
      // skip ahead to the next valid beat instead of playing a burst of missed sounds.
      if (nextNoteTimeRef.current < ctx.currentTime - 0.1) {
        nextNoteTimeRef.current = ctx.currentTime;
      }

      while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
        let isAudible = true;
        if (gapClickMode) {
          const totalBeats = currentBeatInBarRef.current;
          const barIndex = Math.floor(totalBeats / timeSignature);
          const cycle = gapClickBarsOn + gapClickBarsOff;
          const barInCycle = barIndex % cycle;
          if (barInCycle >= gapClickBarsOn) {
            isAudible = false;
          }
        }

        if (playMetronome && isAudible) {
          playTick('metronome', nextNoteTimeRef.current, currentBeatInBarRef.current, timeSignature);
        }
        nextNoteTimeRef.current += 60.0 / (parseInt(bpmInput, 10) || 120);
        currentBeatInBarRef.current += 1;
      }
      timerID = window.setTimeout(scheduler, 25);
    };
    if (activeSession && mode === 'absolute') {
      scheduler();
    }
    return () => { if (timerID) window.clearTimeout(timerID); };
  }, [activeSession, bpmInput, playMetronome, mode, timeSignature]);

  const handleTapAreaClick = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.settings-overlay') || target.closest('.settings-btn')) return;
    initAudio();
    if (!showSettings) {
      const audioCtx = getAudioContext();
      if (mode === 'absolute' && !activeSession && audioCtx) {
        // Schedule next beat relative to now, subtracting offset so audio plays early to compensate for user lag.
        nextNoteTimeRef.current = audioCtx.currentTime + (60.0 / (parseInt(bpmInput, 10) || 120)) - (offset / 1000.0);
        currentBeatInBarRef.current = 0; // First tap is beat 0; next scheduled beat is also beat 0 of the next bar cycle
      }
      tap(e.timeStamp);
    }
  };

  const getGradeText = (error: number) => {
    const abs = Math.abs(error);
    if (abs <= perfectWindow) return 'PERFECT';
    if (abs <= perfectWindow * 1.5) return 'GREAT';
    if (abs <= perfectWindow * 2.5) return 'GOOD';
    return error > 0 ? 'MISS (LATE)' : 'MISS (EARLY)';
  };

  const getErrorColorClass = (error: number) => {
    const abs = Math.abs(error);
    if (abs <= perfectWindow) return 'error-perfect';
    if (abs <= perfectWindow * 1.5) return 'error-great';
    if (abs <= perfectWindow * 2.5) return 'error-good';
    return 'error-miss';
  };

  const displayBpm = mode === 'absolute' ? (bpmInput || '120') : (detectedBpm ? Math.round(detectedBpm).toString() : '---');

  return (
    <div className={`app-container ${showVisualFlash ? 'accurate' : ''}`} onPointerDown={handleTapAreaClick} onClick={() => initAudio()}>
      <button className="settings-btn" onClick={() => { setShowSettings(true); initAudio(); }} aria-label="Settings"><SettingsIcon /></button>

      {showSettings && (
        <div className="settings-overlay" onPointerDown={e => e.stopPropagation()}>
          <div className="settings-modal">
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)}><CloseIcon /></button>
            </div>
            <div className="settings-body">
              <div className="form-group">
                <label>Training Mode</label>
                <div className="mode-toggle">
                  <button className={mode === 'absolute' ? 'active' : ''} onClick={() => setMode('absolute')}>Master</button>
                  <button className={mode === 'interval' ? 'active' : ''} onClick={() => setMode('interval')}>Tap-to-BPM</button>
                  <button className={mode === 'guitar' ? 'active' : ''} onClick={() => setMode('guitar')}>Guitar</button>
                </div>
                <div className="form-hint">
                  {mode === 'absolute' ? 'Practice keeping tempo with a fixed target BPM.' : 
                   mode === 'interval' ? 'Detect the BPM by tapping along.' : 
                   'Play guitar to the beat — get graded PERFECT/GREAT/GOOD/MISS with ms accuracy.'}
                </div>
              </div>

              {(mode === 'absolute' || mode === 'guitar') && (
                <>
                  <div className="form-group">
                    <label>Target BPM</label>
                    <div className="input-with-unit"><input type="number" value={bpmInput} onChange={(e) => setBpmInput(e.target.value)} min="30" max="300" /><span>BPM</span></div>
                  </div>
                  <div className="form-group">
                    <label>Time Signature</label>
                    <div className="segment-control">
                      {[2, 3, 4, 5, 6, 7].map(num => (
                        <button
                          key={num}
                          className={timeSignature === num ? 'active' : ''}
                          onClick={() => setTimeSignature(num)}
                        >
                          {num}/4
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Timing Strictness (ms)</label>
                    <div className="input-with-unit"><input type="number" value={perfectWindowInput} onChange={(e) => setPerfectWindowInput(e.target.value)} min="1" max="200" /><span>ms</span></div>
                    <div className="form-hint">How close your strum must be to the beat for a "PERFECT" score.</div>
                  </div>

                  {mode === 'absolute' && (
                    <>
                      <div className="form-group">
                        <label>Audio Sync (ms)</label>
                        <div className="input-with-unit"><input type="number" value={offsetInput} onChange={(e) => setOffsetInput(e.target.value)} /><span>ms</span></div>
                        <div className="calibrate-actions" style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button className="calibrate-btn" onClick={() => { setShowSettings(false); setShowCalibrationTest(true); }} style={{ width: '100%' }}>
                            Start Calibration Test
                          </button>
                        </div>
                        <div className="form-hint">Fixes delays from Bluetooth headphones or your screen.</div>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><label>Metronome Sound</label></div>
                        <label className="switch"><input type="checkbox" checked={playMetronome} onChange={(e) => { setPlayMetronome(e.target.checked); initAudio(); }} /><span className="slider round"></span></label>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><label>Visual Rhythm Bar</label></div>
                        <label className="switch"><input type="checkbox" checked={showVisualBar} onChange={(e) => setShowVisualBar(e.target.checked)} /><span className="slider round"></span></label>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><label>Performance Audio Feedback</label></div>
                        <label className="switch"><input type="checkbox" checked={playPerformanceSound} onChange={(e) => { setPlayPerformanceSound(e.target.checked); initAudio(); }} /><span className="slider round"></span></label>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><label>Perfect Hit Sound</label></div>
                        <label className="switch"><input type="checkbox" checked={playHitsound} onChange={(e) => { setPlayHitsound(e.target.checked); initAudio(); }} /><span className="slider round"></span></label>
                      </div>

                      <div className="form-group" style={{ marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <label>Gap Click Training</label>
                          <label className="switch"><input type="checkbox" checked={gapClickMode} onChange={(e) => setGapClickMode(e.target.checked)} /><span className="slider round"></span></label>
                        </div>
                        {gapClickMode && (
                          <div className="gap-settings" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Bars ON</label>
                              <input type="number" value={gapClickBarsOn} onChange={(e) => setGapClickBarsOn(parseInt(e.target.value, 10) || 1)} min="1" max="16" style={{ width: '100%' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Bars OFF</label>
                              <input type="number" value={gapClickBarsOff} onChange={(e) => setGapClickBarsOff(parseInt(e.target.value, 10) || 1)} min="1" max="16" style={{ width: '100%' }} />
                            </div>
                          </div>
                        )}
                        <div className="form-hint">Silence the metronome periodically to test your timing.</div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="header">
        <h1>{mode === 'absolute' ? 'Rhythm Master' : mode === 'interval' ? 'BPM Detector' : 'Guitar Trainer'}</h1>
        {mode !== 'guitar' && (
          <div className="bpm-display">
            <span className="bpm-value">{displayBpm}</span>
            <span className="bpm-label">{mode === 'absolute' ? 'TARGET BPM' : 'DETECTED BPM'}</span>
          </div>
        )}
      </div>

      {mode === 'guitar' ? (
        <GuitarMode />
      ) : (
        <>
          <div className="main-display">
            {activeSession ? (
              mode === 'absolute' ? (
                lastError !== null && (
                  <div className="recent-error">
                    <div className="error-label">Current Delay</div>
                    <div className={`error-value ${getErrorColorClass(lastError)}`}>{lastError > 0 ? '+' : ''}{lastError.toFixed(1)} ms</div>
                    <div className={`feedback-text ${getErrorColorClass(lastError)}`}>{getGradeText(lastError)}</div>
                  </div>
                )
              ) : (
                <div className="recent-error">
                  <div className="error-label">Interval</div>
                  <div className="error-value" style={{ color: '#60a5fa' }}>{taps[taps.length - 1]?.error.toFixed(0)} ms</div>
                  <div className="feedback-text">Keep tapping...</div>
                </div>
              )
            ) : (
              <div className="recent-error empty">
                <div className="instruction">TAP TO START</div>
                <div className="sub-instruction">{mode === 'absolute' ? 'Match the target rhythm' : 'Find your rhythm'}</div>
              </div>
            )}
          </div>

          {mode === 'absolute' && showVisualBar && (
            <RhythmBar
              bpm={parseInt(bpmInput, 10) || 120}
              startTime={activeSession ? startTime : null}
              offset={offset}
              signature={timeSignature}
            />
          )}

          <div className="results-section" onPointerDown={e => e.stopPropagation()}>
            <div className="results-header"><span>History</span></div>
            <div className="results-list">
              {taps.slice().reverse().map((tapRecord: TapRecord, idx: number) => (
                <div key={idx} className="result-item">
                  <span className="result-beat">{mode === 'absolute' ? `Beat ${tapRecord.index}` : `Tap ${taps.length - idx}`}</span>
                  <span className={`result-error ${mode === 'absolute' ? getErrorColorClass(tapRecord.error) : ''}`}>
                    {mode === 'absolute' ? `${getGradeText(tapRecord.error)} (${tapRecord.error > 0 ? '+' : ''}${tapRecord.error.toFixed(1)} ms)` : `${tapRecord.error.toFixed(0)} ms`}
                  </span>
                </div>
              ))}
              {taps.length === 0 && <div className="empty-msg">No taps yet...</div>}
            </div>
          </div>
        </>
      )}

      {showCalibrationTest && (
        <CalibrationTest
          onApply={handleApplyCalibrationTest}
          onCancel={() => { setShowCalibrationTest(false); setShowSettings(true); }}
        />
      )}
    </div>
  );
}

export default App;
