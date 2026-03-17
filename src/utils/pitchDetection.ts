/**
 * Pitch detection using autocorrelation algorithm
 */

export interface DetectedNote {
    frequency: number;
    note: string;
    octave: number;
    cents: number; // deviation from the note in cents
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQUENCY = 440;
const A4_NOTE_INDEX = 9;
const A4_OCTAVE = 4;

/**
 * Autocorrelation algorithm for pitch detection
 */
export function detectPitch(buffer: Float32Array): DetectedNote | null {
    const freq = autoCorrelate(buffer);
    
    if (freq < 0) {
        return null; // No pitch detected
    }

    return frequencyToNote(freq);
}

/**
 * Autocorrelation FFT algorithm for pitch detection
 * Reference: https://github.com/cwilso/PitchDetect
 */
function autoCorrelate(buffer: Float32Array): number {
    const SIZE = buffer.length;
    
    // Find the size of the buffer we're analyzing
    let maxSamples = Math.floor(SIZE / 2);
    let best_offset = -1;
    let best_correlation = 0;
    let rms = 0;

    // Calculate RMS to check if we have enough signal
    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    // Not enough signal, return -1
    if (rms < 0.01) return -1;

    // Find the best correlation offset
    let lastCorrelation = 1;
    for (let offset = 1; offset < maxSamples; offset++) {
        let correlation = 0;

        for (let i = 0; i < maxSamples; i++) {
            correlation += Math.abs(buffer[i] - buffer[i + offset]);
        }

        correlation = 1 - correlation / maxSamples;

        if (correlation > 0.9 && correlation > lastCorrelation) {
            let foundGoodCorrelation = false;
            if (correlation > best_correlation) {
                best_correlation = correlation;
                best_offset = offset;
                foundGoodCorrelation = true;
            }
            if (foundGoodCorrelation) {
                // Interpolate to get a more accurate offset
                return SIZE / (2 * Math.PI * offset) * 44100;
            }
        }
        lastCorrelation = correlation;
    }

    if (best_correlation > 0.01) {
        return SIZE / (2 * Math.PI * best_offset) * 44100;
    }

    return -1;
}

/**
 * Convert frequency to note with octave and cents
 */
export function frequencyToNote(frequency: number): DetectedNote {
    // Use logarithmic formula to find semitones from A4
    const semitones = 12 * Math.log2(frequency / A4_FREQUENCY);
    
    // Calculate note index and octave
    const noteIndex = Math.round(semitones);
    const cents = (semitones - noteIndex) * 100;
    
    // A4 is at index 9 of NOTES, octave 4
    let absoluteNoteIndex = A4_NOTE_INDEX + A4_OCTAVE * 12 + noteIndex;
    
    let octave = Math.floor(absoluteNoteIndex / 12);
    let note = NOTES[absoluteNoteIndex % 12];
    
    return {
        frequency,
        note,
        octave,
        cents
    };
}

/**
 * Get the nearest note string (e.g., "C4", "D#5")
 */
export function getNoteString(detected: DetectedNote | null): string {
    if (!detected) return '---';
    return `${detected.note}${detected.octave}`;
}

/**
 * Get deviation indicator
 */
export function getDeviationIndicator(cents: number): string {
    const absCents = Math.abs(cents);
    if (absCents < 10) return '✓'; // In tune
    if (cents > 0) return '↑'; // Sharp
    return '↓'; // Flat
}

/**
 * Check if note is in tune (within ±10 cents)
 */
export function isInTune(detected: DetectedNote | null): boolean {
    if (!detected) return false;
    return Math.abs(detected.cents) < 10;
}

/**
 * Filter to keep only guitar frequency range (roughly 80-1000 Hz)
 */
export function isGuitarFrequency(frequency: number): boolean {
    return frequency > 75 && frequency < 1500;
}
