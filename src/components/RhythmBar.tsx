import { useEffect, useRef } from 'react';
import './CalibrationTest.css';

interface Props {
    bpm: number;
    startTime: number | null;
    offset: number;
    signature: number;
}

export function RhythmBar({ bpm, startTime, offset, signature }: Props) {
    const targetRingRef = useRef<HTMLDivElement>(null);
    const noteRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (startTime === null) return;
        const interval = 60000 / bpm;
        let rAF: number;

        const animate = () => {
            const now = performance.now();
            const elapsed = now - startTime;
            const currentBeat = Math.floor(elapsed / interval);

            for (let i = currentBeat - 2; i <= currentBeat + 6; i++) {
                if (i < 0) continue;
                const el = noteRefs.current[i % 8];
                if (el) {
                    const targetTime = startTime + i * interval + offset;
                    const timeDiff = targetTime - now;
                    const speed = 0.35; // px per ms
                    const targetX = 60; // matching CSS left
                    const x = targetX + timeDiff * speed;

                    // It's the first beat of the bar if i % signature === 0
                    const isDownbeat = (i % signature) === 0;

                    if (isDownbeat && !el.classList.contains('downbeat')) {
                        el.classList.add('downbeat');
                    } else if (!isDownbeat && el.classList.contains('downbeat')) {
                        el.classList.remove('downbeat');
                    }

                    if (timeDiff > 1000 || timeDiff < -150) {
                        el.style.opacity = '0';
                    } else {
                        el.style.opacity = '1';
                    }
                    el.style.transform = `translateX(${x}px)`;
                }
            }
            rAF = requestAnimationFrame(animate);
        };
        rAF = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rAF);
    }, [startTime, bpm, offset, signature]);

    useEffect(() => {
        const handleTap = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.settings-btn') || target.closest('.settings-modal')) return;

            if (targetRingRef.current && startTime !== null) {
                const ring = targetRingRef.current;
                ring.classList.add('hit');
                setTimeout(() => {
                    if (ring) ring.classList.remove('hit');
                }, 100);
            }
        };
        window.addEventListener('pointerdown', handleTap);
        return () => window.removeEventListener('pointerdown', handleTap);
    }, [startTime]);

    return (
        <div className="track-container main-page-track">
            <div className="track-line"></div>
            <div className="target-ring" ref={targetRingRef}></div>
            {Array.from({ length: 8 }).map((_, idx) => (
                <div
                    key={idx}
                    ref={el => { noteRefs.current[idx] = el; }}
                    className="rhythm-note test"
                    style={{ opacity: 0 }}
                />
            ))}
            {startTime === null && (
                <div className="track-overlay-text">AWAITING INPUT</div>
            )}
        </div>
    );
}
