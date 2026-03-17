import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { detectPitch, isInTune, isGuitarFrequency } from '../utils/pitchDetection';
import type { DetectedNote } from '../utils/pitchDetection';

export interface GuitarNoteRecord {
    time: number;
    note: string | null;
    frequency: number | null;
    cents: number | null;
    inTune: boolean;
}

export function useGuitarTrainer() {
    const [bpm, setBpm] = useLocalStorage('bpm_guitar_bpm', 120);
    const [micActive, setMicActive] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [currentNote, setCurrentNote] = useState<DetectedNote | null>(null);
    const [notes, setNotes] = useState<GuitarNoteRecord[]>([]);
    const [activeSession, setActiveSession] = useState(false);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    const startMicrophone = useCallback(async () => {
        try {
            setPermissionDenied(false);
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });

            mediaStreamRef.current = stream;

            // Create audio context
            const audioContext =
                new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;

            // Create analyser node
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 4096;
            analyser.smoothingTimeConstant = 0.8;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

            setMicActive(true);
            setActiveSession(true);
            startTimeRef.current = Date.now();

            // Start processing
            processPitch();
        } catch (error: any) {
            console.error('Microphone error:', error);
            if (error.name === 'NotAllowedError') {
                setPermissionDenied(true);
            }
        }
    }, []);

    const processPitch = useCallback(() => {
        if (!analyserRef.current || !dataArrayRef.current) return;

        const buffer = new Float32Array(analyserRef.current.fftSize);

        // Get time domain data
        (analyserRef.current as any).getFloatTimeDomainData(buffer);

        // Detect pitch
        const detected = detectPitch(buffer);

        // Filter to guitar frequency range
        if (detected && isGuitarFrequency(detected.frequency)) {
            setCurrentNote(detected);

            // Add to history
            setNotes((prev) => [
                ...prev.slice(-99), // Keep last 100 notes
                {
                    time: Date.now() - (startTimeRef.current || Date.now()),
                    note: `${detected.note}${detected.octave}`,
                    frequency: detected.frequency,
                    cents: detected.cents,
                    inTune: isInTune(detected),
                },
            ]);
        } else {
            setCurrentNote(null);
        }

        animationFrameRef.current = requestAnimationFrame(processPitch);
    }, []);

    const stopMicrophone = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setMicActive(false);
        setActiveSession(false);
        setCurrentNote(null);
    }, []);

    const resetSession = useCallback(() => {
        setNotes([]);
        setCurrentNote(null);
        startTimeRef.current = Date.now();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (micActive) {
                stopMicrophone();
            }
        };
    }, [micActive, stopMicrophone]);

    return {
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
    };
}
