let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
    return audioCtx;
}

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.createBufferSource().start(); // Some browsers need a node to start
        audioCtx.resume();
    }
    return audioCtx;
}

export function playTick(type: 'perfect' | 'metronome' | 'countdown' = 'perfect', time?: number, beatNumber?: number, signature?: number) {
    if (!audioCtx) return;

    const ctx = audioCtx;
    const playTime = time ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    if (type === 'perfect') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(1, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'metronome') {
        osc.type = 'triangle';
        const freq = (beatNumber !== undefined && signature !== undefined && beatNumber % signature === 0) ? 600 : 400;
        osc.frequency.setValueAtTime(freq, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    } else if (type === 'countdown') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, playTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, playTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, playTime + 0.1);
    }

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(playTime);
    osc.stop(playTime + 0.1);
}
