/**
 * Pitch detection using the McLeod Pitch Method (MPM).
 *
 * MPM is the algorithm used by professional guitar-tuner apps (GuitarTuna,
 * Boss TU series, etc.).  It is far more accurate than plain autocorrelation
 * because it:
 *   1. Uses the Normalised Square Difference Function (NSDF) instead of raw
 *      autocorrelation.  NSDF = 1 means perfect period match; 0 is silence;
 *      negative means anti-correlation.
 *   2. Finds ALL local maxima of the NSDF (not just the global one), then
 *      picks the FIRST maximum whose value exceeds k * globalMax (where k ≈ 0.93).
 *      This "key-max" rule naturally selects the fundamental frequency even
 *      when the 2×-harmonic lobe is slightly higher — the main source of
 *      octave-doubling errors in old autocorrelation pickers.
 *   3. Refines the chosen maximum with parabolic interpolation for sub-sample
 *      period accuracy.
 *
 * Reference: McLeod & Wyvill, "A Smarter Way to Find Pitch", ICMC 2005.
 */

export interface DetectedNote {
    frequency: number;
    note: string;
    octave: number;
    cents: number; // deviation from the note in cents (-50 … +50)
}

// Standard guitar open-string frequencies (for reference, not used in math)
// E2 = 82.41  A2 = 110.00  D3 = 146.83  G3 = 196.00  B3 = 246.94  E4 = 329.63
export const GUITAR_STRINGS = [
    { name: 'E2', frequency: 82.41 },
    { name: 'A2', frequency: 110.00 },
    { name: 'D3', frequency: 146.83 },
    { name: 'G3', frequency: 196.00 },
    { name: 'B3', frequency: 246.94 },
    { name: 'E4', frequency: 329.63 },
];

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQUENCY = 440;
const A4_NOTE_INDEX = 9; // 'A' is index 9 in the NOTES array
const A4_OCTAVE = 4;

// MPM key-max threshold (first maximum that is >= this fraction of the global max)
const MPM_K = 0.93;

// Guitar frequency range: low E string (E2 = 82 Hz) to highest fretted note (~1400 Hz)
const GUITAR_MIN_FREQ = 70;   // Hz – slightly below E2 to allow for slight flat
const GUITAR_MAX_FREQ = 1400; // Hz – highest fretted note on high-E string

// Minimum RMS volume to attempt detection (silence gate)
const MIN_RMS = 0.01;

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the pitch from a raw PCM buffer using MPM.
 *
 * @param buffer     Float32Array from AnalyserNode.getFloatTimeDomainData()
 * @param sampleRate The AudioContext sample rate (e.g. 44100 or 48000)
 * @returns DetectedNote or null if no reliable pitch was found
 */
export function detectPitch(buffer: Float32Array, sampleRate = 44100): DetectedNote | null {
    const freq = mpmPitch(buffer, sampleRate);
    if (freq <= 0) return null;
    return frequencyToNote(freq);
}

/**
 * Convert a raw frequency (Hz) to a DetectedNote with musical note name,
 * octave, and cents deviation.
 */
export function frequencyToNote(frequency: number): DetectedNote {
    // Semitones above / below A4
    const semitones = 12 * Math.log2(frequency / A4_FREQUENCY);
    const noteIndex = Math.round(semitones);          // nearest semitone integer
    const cents = (semitones - noteIndex) * 100;      // residual in cents

    // Absolute semitone index from C0
    const absoluteIndex = A4_NOTE_INDEX + A4_OCTAVE * 12 + noteIndex;
    const octave = Math.floor(absoluteIndex / 12);
    const note   = NOTES[((absoluteIndex % 12) + 12) % 12];

    return { frequency, note, octave, cents };
}

/** Nearest-note string, e.g. "E2", "A3", "D#4" */
export function getNoteString(detected: DetectedNote | null): string {
    if (!detected) return '---';
    return `${detected.note}${detected.octave}`;
}

/** Tuning indicator arrow / tick */
export function getDeviationIndicator(cents: number): string {
    const abs = Math.abs(cents);
    if (abs < 10) return '✓';
    return cents > 0 ? '↑' : '↓';
}

/** True if the note is within ±10 cents of the target */
export function isInTune(detected: DetectedNote | null): boolean {
    if (!detected) return false;
    return Math.abs(detected.cents) < 10;
}

/** True if the frequency is within the guitar playing range */
export function isGuitarFrequency(frequency: number): boolean {
    return frequency >= GUITAR_MIN_FREQ && frequency <= GUITAR_MAX_FREQ;
}

/**
 * Find the nearest guitar open string to a detected frequency.
 * Returns string name (e.g. "E2") and cents offset from that string's pitch.
 */
export function nearestGuitarString(frequency: number): { string: string; cents: number } | null {
    if (!isGuitarFrequency(frequency)) return null;
    let best = GUITAR_STRINGS[0];
    let bestCents = Infinity;

    for (const s of GUITAR_STRINGS) {
        const cents = 1200 * Math.log2(frequency / s.frequency);
        if (Math.abs(cents) < Math.abs(bestCents)) {
            bestCents = cents;
            best = s;
        }
    }
    return { string: best.name, cents: bestCents };
}

// ─── McLeod Pitch Method (MPM) Core ───────────────────────────────────────────

function mpmPitch(buffer: Float32Array, sampleRate: number): number {
    const N = buffer.length;

    // ── 1. Silence gate ──────────────────────────────────────────────────────
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / N);
    if (rms < MIN_RMS) return -1;

    // ── 2. Lag window corresponding to guitar frequency range ────────────────
    const lagMin = Math.floor(sampleRate / GUITAR_MAX_FREQ);  // ~31 at 44.1 kHz
    const lagMax = Math.min(Math.ceil(sampleRate / GUITAR_MIN_FREQ), Math.floor(N / 2)); // ~630

    // ── 3. Compute NSDF via the "r'(τ)" formula ──────────────────────────────
    //
    //   nsdf(τ) = 2 · m(τ)  /  (autocorr(0,    τ) + autocorr(0, τ))
    //           = 2 · m(τ)  /  (m(0) + ... )
    //
    // Where m(τ) = Σ_{j=0}^{N-1-τ}  x[j] · x[j+τ]    (cross-correlation)
    //       n(τ) = Σ_{j=0}^{N-1-τ} (x[j]² + x[j+τ]²)  (normalising sum)
    //
    // nsdf(τ) = 2·m(τ) / n(τ)
    //
    // This naturally equals 1 at τ=0 and equals the peak correlation coefficient
    // at subsequent periodic lags — it is NOT affected by signal amplitude.
    //
    // We set up running sums to compute both m(τ) and n(τ) incrementally,
    // which is O(N·lagMax) but still fast enough in real-time at 44.1 kHz.

    const nsdf = new Float32Array(lagMax + 1);

    // Initialise n = sum of (x[j]^2 + x[j+0]^2) for τ=0, which is just 2 * sumSq
    // but we recalculate it properly below to avoid the τ=0 special case messing
    // up the loop structure.

    let m   = 0; // running cross-correlation
    let nSum = 0; // running normalising sum

    // Bootstrap: compute for τ = 0 separately (not needed for pitch, but keeps
    // the loop index clean).  We start writing nsdf at index lagMin.
    // Pre-compute the full-window sums.
    for (let j = 0; j < N; j++) {
        m    += buffer[j] * buffer[j]; // autocorr at lag 0
        nSum += 2 * buffer[j] * buffer[j];
    }
    // nsdf[0] = 1 by definition — we don't use it

    // Compute nsdf for lags 1 … lagMax by subtracting the terms that "fall off"
    // as the overlap window shrinks.
    // At lag τ, the window covers j = 0 … N-1-τ:
    //   m(τ)    = Σ_{j=0}^{N-1-τ}  x[j]·x[j+τ]
    //   n(τ)    = Σ_{j=0}^{N-1-τ} (x[j]² + x[j+τ]²)
    //
    // Incremental update from τ-1 → τ:
    //   m(τ) is NOT easily incremental because the kernel changes; compute directly.
    //   n(τ) = n(τ-1) - x[0]² - x[N-τ]²   (the two samples dropping out)
    //          Wait — this gives n for a different set than m.  For correctness we
    //          must compute n(τ) with the same window as m(τ).
    //
    // Simplest correct O(N·L) approach: compute m(τ) and n(τ) directly.
    // For L ≈ 600 and N = 4096–8192 this is ~5 M multiplies per frame, which is
    // acceptable in a requestAnimationFrame callback.

    for (let lag = lagMin; lag <= lagMax; lag++) {
        let mTau = 0;
        let nTau = 0;
        const len = N - lag;
        for (let j = 0; j < len; j++) {
            mTau += buffer[j] * buffer[j + lag];
            nTau += buffer[j] * buffer[j] + buffer[j + lag] * buffer[j + lag];
        }
        nsdf[lag] = nTau > 0 ? (2 * mTau) / nTau : 0;
    }

    // ── 4. Find all local maxima of nsdf in [lagMin, lagMax] ─────────────────
    const maxima: Array<{ lag: number; value: number }> = [];
    for (let lag = lagMin + 1; lag < lagMax; lag++) {
        if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > 0) {
            maxima.push({ lag, value: nsdf[lag] });
        }
    }

    if (maxima.length === 0) return -1;

    // ── 5. Key-max: find the first maximum >= k * globalMax ──────────────────
    const globalMax = Math.max(...maxima.map(m => m.value));
    if (globalMax < 0.5) return -1; // no credible periodic signal

    const threshold = MPM_K * globalMax;
    const chosen = maxima.find(m => m.value >= threshold);
    if (!chosen) return -1;

    // ── 6. Parabolic interpolation for sub-sample lag precision ──────────────
    const lag0 = chosen.lag;
    const y0   = nsdf[lag0 - 1] ?? nsdf[lag0];
    const y1   = nsdf[lag0];
    const y2   = nsdf[lag0 + 1] ?? nsdf[lag0];

    const denom = 2 * (2 * y1 - y0 - y2);
    const refinedLag = denom !== 0 ? lag0 + (y0 - y2) / denom : lag0;

    if (refinedLag <= 0) return -1;

    const freq = sampleRate / refinedLag;
    return isGuitarFrequency(freq) ? freq : -1;
}
