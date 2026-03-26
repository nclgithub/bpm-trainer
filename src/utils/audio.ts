let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
    return audioCtx;
}

export function initAudio() {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        const dummy = audioCtx.createBufferSource();
        dummy.start();
        audioCtx.resume();
    }
    return audioCtx;
}

export async function ensureAudioResumed() {
    const ctx = initAudio();
    if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
    }
    return ctx;
}

export function playTick(type: 'perfect' | 'metronome' | 'countdown' | 'early' | 'late' | 'perfect_hit' = 'perfect', time?: number, beatNumber?: number, signature?: number): OscillatorNode | undefined {
    if (!audioCtx) return undefined;

    const ctx = audioCtx;
    const playTime = time ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    if (type === 'perfect' || type === 'perfect_hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(type === 'perfect' ? 800 : 1000, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'metronome') {
        osc.type = 'triangle';
        const freq = (beatNumber !== undefined && signature !== undefined && beatNumber % signature === 0) ? 600 : 400;
        osc.frequency.setValueAtTime(freq, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'countdown') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'early') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, playTime);
        osc.frequency.exponentialRampToValueAtTime(50, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'late') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, playTime);
        osc.frequency.exponentialRampToValueAtTime(200, playTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.15);
    }

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(playTime);
    osc.stop(playTime + 0.2);
    return osc;
}
