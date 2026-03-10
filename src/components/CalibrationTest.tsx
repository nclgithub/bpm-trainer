import { useState, useRef, useEffect } from 'react';
import { initAudio, playTick } from '../utils/audio';
import './CalibrationTest.css';

interface Props {
    onApply: (offset: number) => void;
    onCancel: () => void;
}

export function CalibrationTest({ onApply, onCancel }: Props) {
    const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [taps, setTaps] = useState<number[]>([]);
    const [avgOffset, setAvgOffset] = useState<number>(0);
    const [bpmInput, setBpmInput] = useState('120');
    const [notes, setNotes] = useState<{ id: number, perfTime: number, isCountdown: boolean }[]>([]);

    const expectedTimesRef = useRef<number[]>([]);
    const testEndTimerRef = useRef<number | null>(null);
    const targetRingRef = useRef<HTMLDivElement>(null);
    const noteRefs = useRef<(HTMLDivElement | null)[]>([]);
    const trackRef = useRef<HTMLDivElement>(null);

    const stopTest = () => {
        if (testEndTimerRef.current) window.clearTimeout(testEndTimerRef.current);
        testEndTimerRef.current = null;
    };

    useEffect(() => {
        return () => stopTest();
    }, []);

    // Removed local playBeep in favor of shared playTick

    const startTest = () => {
        let parsedBpm = parseInt(bpmInput, 10);
        if (isNaN(parsedBpm) || parsedBpm <= 0) parsedBpm = 120;

        const ctx = initAudio();
        if (!ctx) return;

        const baseAudioTime = ctx.currentTime + 1.0; // Start in 1000ms
        const basePerfTime = performance.now() + 1000;
        const interval = 60.0 / parsedBpm;

        const generatedNotes = [];
        expectedTimesRef.current = [];

        for (let i = 0; i < 12; i++) {
            const isCountdown = i < 4;
            const timeOffset = i * interval;
            playTick(isCountdown ? 'countdown' : 'metronome', baseAudioTime + timeOffset, i, 4);

            const notePerfTime = basePerfTime + timeOffset * 1000;
            generatedNotes.push({
                id: i,
                isCountdown,
                perfTime: notePerfTime
            });

            if (!isCountdown) {
                expectedTimesRef.current.push(notePerfTime);
            }
        }

        noteRefs.current = new Array(12).fill(null);
        setNotes(generatedNotes);
        setTaps([]);
        setStatus('running');

        const testDurationMs = 1000 + 12 * interval * 1000 + 1000;
        testEndTimerRef.current = window.setTimeout(() => {
            finishTest();
        }, testDurationMs);
    };

    useEffect(() => {
        if (status !== 'running') return;

        let rAF: number;
        const animate = () => {
            const now = performance.now();
            notes.forEach((note, i) => {
                const el = noteRefs.current[i];
                if (el) {
                    const timeDiff = note.perfTime - now;
                    const speed = 0.35; // px per ms
                    const targetX = 60; // matching CSS left: 60px

                    const x = targetX + timeDiff * speed;
                    el.style.transform = `translateX(${x}px)`;

                    // Hide if well past target
                    if (timeDiff < -200) {
                        el.style.opacity = '0';
                    } else {
                        el.style.opacity = '1';
                    }
                }
            });
            rAF = requestAnimationFrame(animate);
        }
        rAF = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rAF);
    }, [status, notes]);

    const finishTest = () => {
        setStatus('done');
        stopTest();

        setTaps(currentTaps => {
            let totalError = 0;
            let validTaps = 0;

            expectedTimesRef.current.forEach(expected => {
                if (currentTaps.length === 0) return;
                let closestTap = currentTaps[0];
                let minDiff = Math.abs(expected - closestTap);

                for (let i = 1; i < currentTaps.length; i++) {
                    const diff = Math.abs(expected - currentTaps[i]);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestTap = currentTaps[i];
                    }
                }

                if (minDiff < 300) {
                    totalError += (closestTap - expected);
                    validTaps++;
                }
            });

            if (validTaps > 0) {
                setAvgOffset(Math.round(totalError / validTaps));
            } else {
                setAvgOffset(0);
            }

            return currentTaps;
        });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (status === 'running') {
            const time = e.timeStamp;
            setTaps(prev => {
                // If we want to only keep taps after countdown we could check time
                return [...prev, time];
            });

            if (targetRingRef.current) {
                const target = targetRingRef.current;
                target.classList.add('hit');
                setTimeout(() => {
                    if (target) target.classList.remove('hit');
                }, 100);
            }
        }
    };

    return (
        <div className="calibration-overlay">
            <div className="calibration-modal" onPointerDown={(e) => e.stopPropagation()}>
                <div className="calibration-header">
                    <h2>Fix Your Sync</h2>
                    <button className="close-btn" onClick={onCancel}>X</button>
                </div>

                <div className="calibration-body">
                    {status === 'idle' && (
                        <div className="setup-screen">
                            <p>Let's make sure the sound and visuals perfectly match your tapping.</p>

                            <div className="form-group" style={{ marginBottom: '16px', marginTop: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#cbd5e1', fontWeight: 600 }}>Test BPM</label>
                                <div className="input-with-unit" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        value={bpmInput}
                                        onChange={(e) => setBpmInput(e.target.value)}
                                        min="30"
                                        max="300"
                                        style={{ width: '100px', padding: '10px', fontSize: '1.2rem', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: 'white' }}
                                    />
                                    <span style={{ color: '#94a3b8', fontSize: '1.2rem' }}>BPM</span>
                                </div>
                            </div>

                            <ul className="instructions" style={{ marginTop: '20px' }}>
                                <li>Observe <strong>4 countdown notes</strong> to find the beat.</li>
                                <li>Tap the track exactly as the <strong>8 red notes</strong> hit the target!</li>
                                <li>Try to synchronize your tap with the <strong>beep sound</strong>.</li>
                            </ul>
                            <button className="start-btn" onClick={startTest}>Start Test</button>
                        </div>
                    )}

                    {status === 'running' && (
                        <div
                            className="track-container"
                            ref={trackRef}
                            onPointerDown={handlePointerDown}
                        >
                            <div className="track-line"></div>
                            <div className="target-ring" ref={targetRingRef}></div>
                            {notes.map((note, idx) => (
                                <div
                                    key={note.id}
                                    ref={el => { noteRefs.current[idx] = el; }}
                                    className={`rhythm-note ${note.isCountdown ? 'countdown' : 'test'}`}
                                />
                            ))}
                            <div className="tap-info" style={{ position: 'absolute', bottom: 10, right: 15, zIndex: 10, color: '#94a3b8', fontWeight: 600 }}>
                                Taps: {taps.length}
                            </div>
                        </div>
                    )}

                    {status === 'done' && (
                        <div className="result-screen">
                            <h3>Calibration Complete</h3>
                            <div className="result-value">
                                <span className="offset-number">{avgOffset > 0 ? `+${avgOffset}` : avgOffset}</span>
                                <span className="offset-unit">ms</span>
                            </div>
                            <p className="result-desc">
                                {avgOffset > 0
                                    ? "Result: You're tapping a bit late. We'll shift the timing to help you out."
                                    : avgOffset < 0
                                        ? "Result: You're tapping a bit early. We'll shift the timing to help you out."
                                        : "Nice! Your timing is spot on."}
                            </p>
                            <div className="action-buttons">
                                <button className="retry-btn" onClick={() => setStatus('idle')}>Retry</button>
                                <button className="apply-btn" onClick={() => onApply(avgOffset)}>Apply Offset</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
