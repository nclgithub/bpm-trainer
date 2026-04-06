import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { detectPitch, isGuitarFrequency } from '../utils/pitchDetection';
import type { DetectedNote } from '../utils/pitchDetection';

export interface GuitarBeatRecord {
    index: number;      // beat index
    time: number;       // ms elapsed since session start
    error: number;      // ms deviation from the beat grid (negative = early, positive = late)
    note: string | null;     // e.g. "E2", "A3"
    frequency: number | null;
    cents: number | null;
}

/** Minimum RMS amplitude to count as a "hit" (lowered to catch quiet single notes) */
const HIT_RMS_THRESHOLD = 0.007;
/** Minimum ms between consecutive hits to debounce rapid strumming */
const HIT_DEBOUNCE_MS = 120;

/**
 * How many consecutive frames the same note must appear before we commit it
 * as the "current note" shown to the user.  2 frames ≈ 33 ms at 60 fps —
 * fast enough to catch single-note transients without flickering.
 */
const NOTE_STABILITY_FRAMES = 2;

export function useGuitarTrainer() {
    // Share the same localStorage keys as the main trainer so settings are unified
    const [bpm, setBpm] = useLocalStorage('bpm_trainer_bpm', 120);
    const [timeSignature, setTimeSignature] = useLocalStorage('bpm_trainer_signature', 4);
    const [perfectWindow, setPerfectWindow] = useLocalStorage('bpm_trainer_window', 30);

    const [micActive, setMicActive] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [activeSession, setActiveSession] = useState(false);

    const [currentNote, setCurrentNote] = useState<DetectedNote | null>(null);
    const [lastBeat, setLastBeat] = useState<GuitarBeatRecord | null>(null);
    const [beats, setBeats] = useState<GuitarBeatRecord[]>([]);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Session timing refs
    const sessionStartWallRef = useRef<number | null>(null);
    const beatCountRef = useRef<number>(0);

    // Hit debounce
    const lastHitTimeRef = useRef<number | null>(null);
    // Whether we are currently in a "note-on" state (to detect onset)
    const inNoteRef = useRef<boolean>(false);

    // Note stability buffer — holds the last N detected note strings; we only
    // update the displayed note when the same note appears N times in a row.
    const stabilityBufRef = useRef<string[]>([]);

    const bpmRef = useRef<number>(bpm);
    bpmRef.current = bpm;

    const perfectWindowRef = useRef<number>(perfectWindow);
    perfectWindowRef.current = perfectWindow;

    // Keep a ref to the latest detected note for use inside onset callbacks
    const detectedNoteRef = useRef<DetectedNote | null>(null);

    const stopMicrophone = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setMicActive(false);
        setActiveSession(false);
        setCurrentNote(null);
        sessionStartWallRef.current = null;
        inNoteRef.current = false;
        lastHitTimeRef.current = null;
        stabilityBufRef.current = [];
        detectedNoteRef.current = null;
    }, []);

    const processFrame = useCallback(() => {
        const analyser = analyserRef.current;
        const audioCtx = audioContextRef.current;
        if (!analyser || !audioCtx) return;

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);

        // --- RMS for onset detection ---
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / buffer.length);

        const isSound = rms > HIT_RMS_THRESHOLD;
        const nowPerf = performance.now();

        // ── Pitch detection (MPM) ─────────────────────────────────────────────
        const sampleRate = audioCtx.sampleRate;
        const detected = isSound ? detectPitch(buffer, sampleRate) : null;

        // Store the raw detection for onset callbacks
        detectedNoteRef.current = detected && isGuitarFrequency(detected.frequency) ? detected : null;

        // ── Stability filter before updating state ────────────────────────────
        const noteKey = detectedNoteRef.current
            ? `${detectedNoteRef.current.note}${detectedNoteRef.current.octave}`
            : '';

        stabilityBufRef.current.push(noteKey);
        if (stabilityBufRef.current.length > NOTE_STABILITY_FRAMES) {
            stabilityBufRef.current.shift();
        }

        // Only commit if all recent frames agree
        if (stabilityBufRef.current.length === NOTE_STABILITY_FRAMES) {
            const allSame = stabilityBufRef.current.every(k => k === stabilityBufRef.current[0]);
            if (allSame) {
                if (noteKey === '') {
                    setCurrentNote(null);
                } else if (detectedNoteRef.current) {
                    setCurrentNote(detectedNoteRef.current);
                }
            }
        }

        // --- Onset detection (rising edge — fires on the FIRST frame above threshold) ---
        // Single plucked notes have a sharp transient that decays within 1-2 frames;
        // the old 15 ms gate caused them to be missed entirely. The MPM pitch quality
        // check (globalMax < 0.5 guard) and HIT_DEBOUNCE_MS together prevent false triggers.
        if (isSound && !inNoteRef.current) {
            inNoteRef.current = true;

            // Debounce rapid strums
            if (lastHitTimeRef.current !== null && nowPerf - lastHitTimeRef.current < HIT_DEBOUNCE_MS) {
                animationFrameRef.current = requestAnimationFrame(processFrame);
                return;
            }
            lastHitTimeRef.current = nowPerf;

            // Record this hit against the beat grid
            const sessionStartWall = sessionStartWallRef.current;
            const note = detectedNoteRef.current;
            if (sessionStartWall !== null) {
                const currentBpm = bpmRef.current;
                const interval = 60000 / currentBpm;
                const elapsed = nowPerf - sessionStartWall;
                const closestBeat = Math.round(elapsed / interval);
                const expectedMs = closestBeat * interval;
                const error = elapsed - expectedMs;
                beatCountRef.current += 1;

                const noteStr = note ? `${note.note}${note.octave}` : null;

                const record: GuitarBeatRecord = {
                    index: beatCountRef.current,
                    time: elapsed,
                    error,
                    note: noteStr,
                    frequency: note?.frequency ?? null,
                    cents: note?.cents ?? null,
                };
                setLastBeat(record);
                setBeats(prev => [...prev.slice(-49), record]);
            }
        } else if (!isSound) {
            inNoteRef.current = false;
        }

        animationFrameRef.current = requestAnimationFrame(processFrame);
    }, []);

    const startMicrophone = useCallback(async () => {
        try {
            setPermissionDenied(false);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            mediaStreamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;

            const analyser = audioContext.createAnalyser();
            // 8192 samples → ~5.4 Hz frequency resolution at 44.1 kHz,
            // enough to distinguish E2 (82 Hz) from F2 (87 Hz).
            // For MPM this also means the lag buffer is long enough to capture
            // the full period of E2 (≈ 536 samples at 44.1 kHz).
            analyser.fftSize = 8192;
            // No smoothing — MPM operates on raw time-domain samples; smoothing
            // only helps spectrum visualisation and would distort the waveform.
            analyser.smoothingTimeConstant = 0.0;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyserRef.current = analyser;

            // Record session start
            sessionStartWallRef.current = performance.now();
            beatCountRef.current = 0;
            inNoteRef.current = false;
            lastHitTimeRef.current = null;
            stabilityBufRef.current = [];
            detectedNoteRef.current = null;

            setBeats([]);
            setLastBeat(null);
            setMicActive(true);
            setActiveSession(true);

            processFrame();
        } catch (error: any) {
            if (error.name === 'NotAllowedError') setPermissionDenied(true);
            console.error('Microphone error:', error);
        }
    }, [processFrame]);

    const resetSession = useCallback(() => {
        sessionStartWallRef.current = performance.now();
        beatCountRef.current = 0;
        inNoteRef.current = false;
        lastHitTimeRef.current = null;
        stabilityBufRef.current = [];
        detectedNoteRef.current = null;
        setBeats([]);
        setLastBeat(null);
        setCurrentNote(null);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (micActive) stopMicrophone();
        };
    }, [micActive, stopMicrophone]);

    return {
        bpm,
        setBpm,
        timeSignature,
        setTimeSignature,
        perfectWindow,
        setPerfectWindow,
        micActive,
        activeSession,
        permissionDenied,
        currentNote,
        lastBeat,
        beats,
        startMicrophone,
        stopMicrophone,
        resetSession,
    };
}
