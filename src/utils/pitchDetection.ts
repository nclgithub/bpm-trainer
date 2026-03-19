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
 * Detect the pitch from a PCM buffer using autocorrelation.
 * @param buffer   Float32Array of raw PCM samples (from AnalyserNode.getFloatTimeDomainData)
 * @param sampleRate  The audio context sample rate (e.g. 44100 or 48000)
 */
export function detectPitch(buffer: Float32Array, sampleRate = 44100): DetectedNote | null {
    const freq = autoCorrelate(buffer, sampleRate);
    if (freq < 0) return null;
    return frequencyToNote(freq);
}

/**
 * Autocorrelation-based pitch detection.
 *
 * Key correctness points vs the old version:
 *  1. We scan the *entire* lag range to find the global best correlation,
 *     rather than returning on the first rising correlation.
 *  2. Frequency = sampleRate / lag  (not the broken SIZE/(2π*lag)*44100 formula).
 *  3. Parabolic interpolation on the peak gives sub-sample lag accuracy.
 *  4. We skip lag=0 and only accept correlations above 0.9 to filter noise.
 */
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
    const SIZE = buffer.length;

    // RMS check – too quiet → no pitch
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.008) return -1;

    // Normalise (remove DC offset and scale so max amplitude = 1)
    let maxAmp = 0;
    let sum = 0;
    for (let i = 0; i < SIZE; i++) sum += buffer[i];
    const mean = sum / SIZE;
    const normalised = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        normalised[i] = buffer[i] - mean;
        if (Math.abs(normalised[i]) > maxAmp) maxAmp = Math.abs(normalised[i]);
    }
    if (maxAmp === 0) return -1;
    for (let i = 0; i < SIZE; i++) normalised[i] /= maxAmp;

    // Guitar range: 70 Hz (low B0 of a bass) – 1300 Hz (high frets on high E)
    const minFreq = 70;
    const maxFreq = 1300;
    const minLag = Math.floor(sampleRate / maxFreq);
    const maxLag = Math.ceil(sampleRate / minFreq);

    // Compute normalised autocorrelation (NSDF-style)
    let bestCorrelation = -1;
    let bestLag = -1;

    for (let lag = minLag; lag <= Math.min(maxLag, Math.floor(SIZE / 2)); lag++) {
        let correlation = 0;
        for (let i = 0; i < SIZE - lag; i++) {
            correlation += normalised[i] * normalised[i + lag];
        }
        // Normalise by number of samples used
        correlation /= (SIZE - lag);

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    // Reject if correlation is too weak (not a tonal sound)
    if (bestCorrelation < 0.85 || bestLag < 0) return -1;

    // Parabolic interpolation for sub-sample precision
    let refinedLag = bestLag;
    if (bestLag > 0 && bestLag < Math.floor(SIZE / 2) - 1) {
        let corrPrev = 0;
        let corrNext = 0;

        for (let i = 0; i < SIZE - (bestLag - 1); i++) corrPrev += normalised[i] * normalised[i + bestLag - 1];
        corrPrev /= (SIZE - (bestLag - 1));

        for (let i = 0; i < SIZE - (bestLag + 1); i++) corrNext += normalised[i] * normalised[i + bestLag + 1];
        corrNext /= (SIZE - (bestLag + 1));

        const denom = 2 * (2 * bestCorrelation - corrPrev - corrNext);
        if (denom !== 0) {
            const delta = (corrPrev - corrNext) / denom;
            refinedLag = bestLag + delta;
        }
    }

    return sampleRate / refinedLag;
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
    const absoluteNoteIndex = A4_NOTE_INDEX + A4_OCTAVE * 12 + noteIndex;

    const octave = Math.floor(absoluteNoteIndex / 12);
    const note = NOTES[((absoluteNoteIndex % 12) + 12) % 12];

    return { frequency, note, octave, cents };
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
 * Filter to keep only guitar frequency range (roughly 70–1300 Hz)
 */
export function isGuitarFrequency(frequency: number): boolean {
    return frequency > 70 && frequency < 1300;
}
