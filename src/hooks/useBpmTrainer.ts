import { useState, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export interface TapRecord {
    index: number;
    time: number;
    expectedTime: number;
    error: number;
}

export type TrainerMode = 'absolute' | 'interval';

export function useBpmTrainer(onAccurateTap?: () => void) {
    const [mode, setMode] = useState<TrainerMode>('absolute');
    const [bpm, setBpm] = useLocalStorage('bpm_trainer_bpm', 120);
    const [timeSignature, setTimeSignature] = useLocalStorage('bpm_trainer_signature', 4);
    const [perfectWindow, setPerfectWindow] = useLocalStorage('bpm_trainer_window', 30);
    const [offset, setOffset] = useLocalStorage('bpm_trainer_offset', 0);
    const [taps, setTaps] = useState<TapRecord[]>([]);
    const [lastError, setLastError] = useState<number | null>(null);
    const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
    const [activeSession, setActiveSession] = useState(false);

    const startTimeRef = useRef<number | null>(null);
    const lastTapTimeRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const resetSession = useCallback(() => {
        startTimeRef.current = null;
        lastTapTimeRef.current = null;
        setActiveSession(false);
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const resetAutoStop = useCallback((currentBpm: number) => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
        }
        const interval = 60000 / currentBpm;
        timeoutRef.current = window.setTimeout(() => {
            resetSession();
        }, interval * 3);
    }, [resetSession]);

    const tap = useCallback((eventTime?: number) => {
        const now = eventTime ?? performance.now();
        setActiveSession(true);

        // Absolute Grid Mode Logic
        if (mode === 'absolute') {
            if (startTimeRef.current === null) {
                // Initialize startTime so that this first tap aligns with the offset-corrected grid.
                // Subtract offset so that (now - startTime) = offset, making the first tap's error 0.
                startTimeRef.current = now - offset;
                setTaps([{ index: 0, time: now, expectedTime: now, error: 0 }]);
                setLastError(0);
                resetAutoStop(bpm);
                if (onAccurateTap) onAccurateTap();
                return;
            }

            const interval = 60000 / bpm;
            const elapsed = now - startTimeRef.current;
            const closestBeat = Math.round(elapsed / interval);
            const expectedTime = startTimeRef.current + closestBeat * interval;
            const rawError = now - expectedTime;
            const error = closestBeat === 0 ? 0 : rawError - offset;

            setTaps(prev => [...prev.slice(-49), { index: closestBeat, time: now, expectedTime, error }]);
            setLastError(error);
            if (Math.abs(error) <= perfectWindow) {
                if (onAccurateTap) onAccurateTap();
            }
            resetAutoStop(bpm);
        }

        // Tap-to-Tap Interval Mode Logic
        else {
            if (lastTapTimeRef.current === null) {
                lastTapTimeRef.current = now;
                setTaps([]);
                setDetectedBpm(null);
                setLastError(null);
                // Use a default timeout for interval mode if no BPM is known yet
                timeoutRef.current = window.setTimeout(() => resetSession(), 5000);
                return;
            }

            const diff = now - lastTapTimeRef.current;
            const instantBpm = 60000 / diff;
            lastTapTimeRef.current = now;

            setDetectedBpm(instantBpm);
            setTaps(prev => [...prev.slice(-19), { index: prev.length + 1, time: now, expectedTime: 0, error: diff }]);

            // Auto stop if silence > 3 seconds in interval mode
            if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
            timeoutRef.current = window.setTimeout(() => resetSession(), 3000);
        }
    }, [mode, bpm, perfectWindow, onAccurateTap, resetAutoStop, resetSession]);

    return {
        mode,
        setMode,
        bpm,
        setBpm,
        timeSignature,
        setTimeSignature,
        perfectWindow,
        setPerfectWindow,
        offset,
        setOffset,
        taps,
        lastError,
        detectedBpm,
        activeSession,
        tap: (eventTime?: number) => tap(eventTime),
        resetSession,
        startTime: startTimeRef.current
    };
}
