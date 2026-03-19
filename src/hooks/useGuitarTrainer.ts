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

/** Minimum RMS amplitude to count as a "hit" */
const HIT_RMS_THRESHOLD = 0.012;
/** Minimum ms between consecutive hits to debounce rapid strumming */
const HIT_DEBOUNCE_MS = 120;
/** Minimum ms that the signal must stay above threshold before counting as note-on */
const NOTE_ON_MIN_MS = 15;

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
    // When the signal first went above threshold (for min-duration gating)
    const noteOnStartRef = useRef<number | null>(null);

    const bpmRef = useRef<number>(bpm);
    bpmRef.current = bpm;

    const perfectWindowRef = useRef<number>(perfectWindow);
    perfectWindowRef.current = perfectWindow;

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
        noteOnStartRef.current = null;
        lastHitTimeRef.current = null;
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

        // Detect pitch (always, so we can show current note in real-time)
        const sampleRate = audioCtx.sampleRate;
        const detected = detectPitch(buffer, sampleRate);
        if (detected && isGuitarFrequency(detected.frequency)) {
            setCurrentNote(detected);
        } else if (!isSound) {
            setCurrentNote(null);
        }

        // --- Onset detection (rising edge with minimum duration gating) ---
        if (isSound && !inNoteRef.current) {
            // Signal just came above threshold — start the gate timer
            if (noteOnStartRef.current === null) {
                noteOnStartRef.current = nowPerf;
            } else if (nowPerf - noteOnStartRef.current >= NOTE_ON_MIN_MS) {
                // Signal has been loud for long enough — register note-on
                inNoteRef.current = true;
                noteOnStartRef.current = null;

                // Debounce rapid strums
                if (lastHitTimeRef.current !== null && nowPerf - lastHitTimeRef.current < HIT_DEBOUNCE_MS) {
                    animationFrameRef.current = requestAnimationFrame(processFrame);
                    return;
                }
                lastHitTimeRef.current = nowPerf;

                // Record this hit against the beat grid
                const sessionStartWall = sessionStartWallRef.current;
                if (sessionStartWall !== null) {
                    const currentBpm = bpmRef.current;
                    const interval = 60000 / currentBpm;
                    const elapsed = nowPerf - sessionStartWall;
                    const closestBeat = Math.round(elapsed / interval);
                    const expectedMs = closestBeat * interval;
                    const error = elapsed - expectedMs;
                    beatCountRef.current += 1;

                    const noteStr = (detected && isGuitarFrequency(detected.frequency))
                        ? `${detected.note}${detected.octave}`
                        : null;

                    const record: GuitarBeatRecord = {
                        index: beatCountRef.current,
                        time: elapsed,
                        error,
                        note: noteStr,
                        frequency: detected?.frequency ?? null,
                        cents: detected?.cents ?? null,
                    };
                    setLastBeat(record);
                    setBeats(prev => [...prev.slice(-49), record]);
                }
            }
        } else if (!isSound) {
            inNoteRef.current = false;
            noteOnStartRef.current = null;
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
            // Larger FFT gives better frequency resolution for low strings
            analyser.fftSize = 8192;
            // No smoothing — pitch detection works on raw samples;
            // smoothing is for spectrum visualisation and hurts onset detection
            analyser.smoothingTimeConstant = 0.0;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyserRef.current = analyser;

            // Record session start
            sessionStartWallRef.current = performance.now();
            beatCountRef.current = 0;
            inNoteRef.current = false;
            noteOnStartRef.current = null;
            lastHitTimeRef.current = null;

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
        noteOnStartRef.current = null;
        lastHitTimeRef.current = null;
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
