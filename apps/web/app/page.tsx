"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import {
    GitBranch,
    AudioLines,
    BarChart3,
    Upload,
    Eye,
    Users,
    Github,
    ChevronDown,
    Waves,
    Monitor,
    Download,
} from "lucide-react";

// ── Apple Logo SVG ─────────────────────────────────────────────────────────

function AppleLogo({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.5-81.5-105.6-208.8-105.6-330 0-194.6 126.4-297.8 250.8-297.8 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.8zm-234-46.7c30.7-36.5 52.4-87.2 52.4-137.9 0-7.1-.6-14.2-1.9-20 -50 1.6-109.2 33.3-145 75.3-25.8 30-53.7 80.7-53.7 132.1 0 7.8.6 15.5 1.3 18.1 2.6.6 5.8.6 9 .6 45.4 0 101.3-30 137.9-68.2z"/>
        </svg>
    );
}

// ── Interactive Audio Visualizer (Hero Background) ─────────────────────────

function AudioVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: 0.5, y: 0.5 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let time = 0;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener("resize", resize);

        const onMouseMove = (e: MouseEvent) => {
            mouseRef.current = {
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            };
        };
        window.addEventListener("mousemove", onMouseMove);

        const draw = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            ctx.clearRect(0, 0, w, h);

            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            // Circular frequency bars radiating from center
            const cx = w * 0.5;
            const cy = h * 0.52;
            const barCount = 120;
            const baseRadius = Math.min(w, h) * 0.18;

            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2;
                const freq1 = Math.sin(time * 0.015 + i * 0.15) * 0.5 + 0.5;
                const freq2 = Math.cos(time * 0.01 + i * 0.08) * 0.3 + 0.5;
                const mouseInfluence = Math.sin(angle - mx * Math.PI * 2) * my * 0.4;
                const amplitude = (freq1 * 0.6 + freq2 * 0.4 + mouseInfluence) * baseRadius * 0.7;

                const innerR = baseRadius;
                const outerR = baseRadius + Math.max(amplitude, 4);

                const x1 = cx + Math.cos(angle) * innerR;
                const y1 = cy + Math.sin(angle) * innerR;
                const x2 = cx + Math.cos(angle) * outerR;
                const y2 = cy + Math.sin(angle) * outerR;

                const hue = 210 + (i / barCount) * 30;
                const lightness = 65 + freq1 * 15;
                const alpha = 0.15 + freq1 * 0.2;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `hsla(${hue}, 40%, ${lightness}%, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Orbiting particles
            for (let i = 0; i < 60; i++) {
                const orbitR = baseRadius * (1.3 + (i % 3) * 0.4);
                const speed = 0.003 + (i % 5) * 0.001;
                const offsetAngle = (i / 60) * Math.PI * 2 + time * speed;
                const wobble = Math.sin(time * 0.02 + i) * 10;

                const px = cx + Math.cos(offsetAngle) * (orbitR + wobble);
                const py = cy + Math.sin(offsetAngle) * (orbitR + wobble) * 0.6;

                const size = 1 + Math.sin(time * 0.03 + i) * 0.8;
                const alpha = 0.1 + Math.sin(time * 0.02 + i * 0.5) * 0.1;

                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 199, 231, ${alpha})`;
                ctx.fill();
            }

            // Concentric pulse rings
            for (let r = 0; r < 3; r++) {
                const pulseR = baseRadius * (1.1 + r * 0.35) + Math.sin(time * 0.02 + r) * 15;
                const alpha = 0.03 + Math.sin(time * 0.015 + r * 2) * 0.02;

                ctx.beginPath();
                ctx.ellipse(cx, cy, pulseR, pulseR * 0.6, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(167, 199, 231, ${Math.max(alpha, 0)})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Flowing sine waves at bottom
            for (let w_i = 0; w_i < 4; w_i++) {
                const yBase = h * (0.75 + w_i * 0.06);
                const amp = 20 + w_i * 8;
                const freq = 0.003 + w_i * 0.001;
                const speed = 0.008 + w_i * 0.003;
                const alpha = 0.04 - w_i * 0.008;

                ctx.beginPath();
                for (let x = 0; x <= w; x += 2) {
                    const y = yBase
                        + Math.sin(x * freq + time * speed) * amp
                        + Math.sin(x * freq * 2.1 + time * speed * 0.6) * amp * 0.3;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = `rgba(167, 199, 231, ${Math.max(alpha, 0)})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            time++;
            animId = requestAnimationFrame(draw);
        };

        draw();
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", onMouseMove);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            aria-hidden
        />
    );
}

// ── Intersection Observer hook for scroll reveal ───────────────────────────

function useFadeIn(threshold = 0.15) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    obs.disconnect();
                }
            },
            { threshold },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);

    return { ref, visible };
}

function FadeInSection({
    children,
    className = "",
    delay = 0,
}: {
    children: React.ReactNode;
    className?: string;
    delay?: number;
}) {
    const { ref, visible } = useFadeIn();
    return (
        <div
            ref={ref}
            className={`transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            } ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
}

// ── Music-themed section dividers ──────────────────────────────────────────

function WaveformDivider({ flip = false }: { flip?: boolean }) {
    return (
        <div className={`relative w-full h-20 overflow-hidden pointer-events-none ${flip ? "rotate-180" : ""}`}>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 80" preserveAspectRatio="none">
                {/* Animated filled wave */}
                <path fill="rgba(167, 199, 231, 0.03)">
                    <animate
                        attributeName="d"
                        dur="6s"
                        repeatCount="indefinite"
                        values="
                            M0 40 Q120 15 240 40 T480 40 T720 40 T960 40 T1200 40 T1440 40 V80 H0Z;
                            M0 40 Q120 55 240 35 T480 45 T720 30 T960 50 T1200 35 T1440 40 V80 H0Z;
                            M0 40 Q120 20 240 50 T480 35 T720 50 T960 30 T1200 45 T1440 40 V80 H0Z;
                            M0 40 Q120 15 240 40 T480 40 T720 40 T960 40 T1200 40 T1440 40 V80 H0Z
                        "
                    />
                </path>
                {/* Animated stroke wave */}
                <path fill="none" stroke="rgba(167, 199, 231, 0.08)" strokeWidth="1.5">
                    <animate
                        attributeName="d"
                        dur="5s"
                        repeatCount="indefinite"
                        values="
                            M0 45 Q180 20 360 45 T720 45 T1080 45 T1440 45;
                            M0 45 Q180 60 360 35 T720 55 T1080 30 T1440 45;
                            M0 45 Q180 25 360 55 T720 35 T1080 55 T1440 45;
                            M0 45 Q180 20 360 45 T720 45 T1080 45 T1440 45
                        "
                    />
                </path>
                {/* Second animated stroke — offset timing for layered feel */}
                <path fill="none" stroke="rgba(167, 199, 231, 0.04)" strokeWidth="1">
                    <animate
                        attributeName="d"
                        dur="8s"
                        repeatCount="indefinite"
                        values="
                            M0 50 Q200 30 400 50 T800 50 T1200 50 T1440 50;
                            M0 50 Q200 60 400 40 T800 55 T1200 35 T1440 50;
                            M0 50 Q200 30 400 50 T800 50 T1200 50 T1440 50
                        "
                    />
                </path>
            </svg>
        </div>
    );
}

function EQBarsDivider() {
    return (
        <div className="relative w-full h-12 flex items-end justify-center gap-[3px] overflow-hidden pointer-events-none opacity-[0.15]">
            {Array.from({ length: 80 }).map((_, i) => {
                const h = 20 + Math.sin(i * 0.3) * 40 + Math.cos(i * 0.7) * 25;
                // Stagger animation delay per bar for a ripple effect
                const delay = (i * 0.06).toFixed(2);
                return (
                    <div
                        key={i}
                        className="w-[1px] rounded-t-full bg-glass-blue-400"
                        style={{
                            height: `${Math.max(h, 5)}%`,
                            animation: `eqPulse ${2 + (i % 3) * 0.5}s ease-in-out ${delay}s infinite`,
                        }}
                    />
                );
            })}
            <style jsx>{`
                @keyframes eqPulse {
                    0%, 100% { transform: scaleY(1); }
                    50% { transform: scaleY(0.4); }
                }
            `}</style>
        </div>
    );
}

// ── Floating particles background (for sections) ──────────────────────────

function FloatingParticles({ count = 20, color = "167, 199, 231" }: { count?: number; color?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;

        const particles = Array.from({ length: count }).map(() => ({
            x: Math.random(),
            y: Math.random(),
            size: 0.5 + Math.random() * 1.5,
            speedX: (Math.random() - 0.5) * 0.0003,
            speedY: -0.0001 - Math.random() * 0.0003,
            alpha: 0.05 + Math.random() * 0.1,
            phase: Math.random() * Math.PI * 2,
        }));

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener("resize", resize);

        let time = 0;
        const draw = () => {
            const w = canvas.getBoundingClientRect().width;
            const h = canvas.getBoundingClientRect().height;
            ctx.clearRect(0, 0, w, h);

            particles.forEach((p) => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
                if (p.x < -0.05 || p.x > 1.05) p.x = Math.random();

                const wobble = Math.sin(time * 0.01 + p.phase) * 0.002;
                const px = (p.x + wobble) * w;
                const py = p.y * h;
                const flickerAlpha = p.alpha + Math.sin(time * 0.02 + p.phase) * 0.03;

                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${color}, ${Math.max(flickerAlpha, 0)})`;
                ctx.fill();
            });

            time++;
            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
        };
    }, [count, color]);

    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />;
}

// ── Swipeable Demo Carousel ───────────────────────────────────────────────

const DEMO_SLIDES = [
    {
        title: "Visual Diff Engine",
        subtitle: "Note-level precision",
        description:
            "Our proprietary diff engine renders every MIDI change on an Ableton-style piano roll, so you can see precisely what your collaborator modified — note by note.",
        render: () => (
            <div className="rounded-xl bg-zinc-900/80 p-5 md:p-6 min-h-[300px] flex flex-col gap-3">
                <div className="flex items-center gap-3 mb-1">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">my-beat.als — commit a3f2c1d</span>
                </div>
                {[
                    { name: "Drums", color: "#FF7C00", notes: [2, 6, 10, 14, 18, 22, 26, 30], type: "unchanged" as const },
                    { name: "Bass", color: "#00CC6E", notes: [3, 10, 14, 22, 30], type: "modified" as const },
                    { name: "Lead Synth", color: "#0059CC", notes: [6, 14, 20, 26, 30], type: "added" as const },
                ].map((track) => (
                    <div key={track.name} className="flex items-stretch gap-0 rounded-lg overflow-hidden border border-white/5">
                        <div className="w-28 shrink-0 flex items-center gap-2 px-3 py-2 border-r border-white/5" style={{ backgroundColor: `${track.color}10` }}>
                            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: track.color }} />
                            <span className="text-xs font-medium text-zinc-300 truncate">{track.name}</span>
                        </div>
                        <div className="flex-1 bg-zinc-950/50 relative h-14 overflow-hidden">
                            <div className="absolute inset-0 flex">
                                {Array.from({ length: 16 }).map((_, j) => (
                                    <div key={j} className={`flex-1 border-r ${j % 4 === 3 ? "border-white/10" : "border-white/[0.03]"}`} />
                                ))}
                            </div>
                            {track.notes.map((pos, ni) => {
                                const color = track.type === "added" ? "rgb(0, 255, 135)" : track.type === "modified" ? "rgb(60, 160, 255)" : "rgb(140, 140, 150)";
                                const glow = track.type !== "unchanged" ? `0 0 6px ${color}` : "none";
                                const noteWidth = 2 + (ni % 3);
                                const yPositions = [15, 40, 65];
                                return (
                                    <div key={ni} className="absolute rounded-sm" style={{
                                        left: `${(pos / 32) * 100}%`, top: `${yPositions[ni % 3]}%`,
                                        width: `${(noteWidth / 32) * 100}%`, height: "20%",
                                        backgroundColor: color, opacity: track.type === "unchanged" ? 0.35 : 0.85, boxShadow: glow,
                                    }} />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        ),
    },
    {
        title: "Discover & Collaborate",
        subtitle: "Global community",
        description:
            "Browse public projects from producers worldwide. Find collaborators by genre, explore their work, and remix projects with a single click.",
        render: () => (
            <div className="rounded-xl bg-zinc-900/80 p-5 md:p-6 min-h-[300px]">
                {/* Three-column explore layout mockup */}
                <div className="grid grid-cols-[80px_1fr_90px] gap-3">
                    {/* Left: Mini profile sidebar */}
                    <div className="rounded-lg border border-white/5 bg-zinc-800/40 p-2 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-glass-blue-400 to-violet-500" />
                        <span className="text-[9px] text-zinc-400 font-medium">aiden.wav</span>
                        <div className="flex items-center gap-1 text-[8px] text-zinc-500">
                            <svg className="w-2.5 h-2.5 text-glass-cyan-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            24
                        </div>
                    </div>
                    {/* Center: Repo cards feed */}
                    <div className="space-y-2">
                        {/* Search bar */}
                        <div className="flex items-center gap-2 rounded-md border border-white/5 bg-zinc-800/30 px-2 py-1.5">
                            <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <span className="text-[9px] text-zinc-500">Search projects...</span>
                            <div className="flex gap-1 ml-auto">
                                {["Top Rated", "Recent"].map((f) => (
                                    <span key={f} className={`rounded px-1.5 py-0.5 text-[8px] ${f === "Top Rated" ? "bg-glass-blue-500/80 text-white" : "bg-zinc-700/50 text-zinc-400"}`}>{f}</span>
                                ))}
                            </div>
                        </div>
                        {/* Card feed */}
                        {[
                            { name: "midnight-sessions", user: "cloud.nine", genre: "Lo-fi", stars: 24 },
                            { name: "neon-dreams-ep", user: "synthwave_sam", genre: "Synthwave", stars: 42 },
                            { name: "drum-kit-vol3", user: "beatsmith", genre: "Hip Hop", stars: 18 },
                        ].map((repo) => (
                            <div key={repo.name} className="rounded-lg border border-white/5 bg-zinc-800/40 p-2.5 hover:border-glass-blue-400/30 transition-colors">
                                {/* Waveform thumbnail */}
                                <div className="h-10 mb-2 rounded bg-zinc-950/50 border border-white/[0.03] flex items-end gap-[1px] px-1 overflow-hidden">
                                    {Array.from({ length: 40 }).map((_, i) => {
                                        const h = 20 + Math.sin(i * 0.4 + repo.stars) * 35 + Math.cos(i * 0.9) * 20;
                                        return <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(h, 8)}%`, backgroundColor: "rgba(167, 199, 231, 0.4)" }} />;
                                    })}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-medium text-zinc-200 truncate">{repo.name}</p>
                                        <p className="text-[8px] text-zinc-500">{repo.user}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[8px] text-glass-blue-400 bg-glass-blue-400/10 rounded-full px-1.5 py-0.5">{repo.genre}</span>
                                        <span className="text-[8px] text-zinc-500">★ {repo.stars}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Right: Trending sidebar */}
                    <div className="rounded-lg border border-white/5 bg-zinc-800/40 p-2">
                        <div className="flex items-center gap-1 mb-2 pb-1.5 border-b border-white/5">
                            <svg className="w-3 h-3 text-glass-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>
                            <span className="text-[9px] font-semibold text-glass-blue-400">Trending</span>
                        </div>
                        {["neon-dreams", "drum-kit", "lo-fi-chill", "ambient-pad"].map((name, i) => (
                            <div key={name} className="flex items-center gap-1.5 py-1 border-b border-white/[0.03] last:border-0">
                                <span className="text-[8px] text-zinc-600 font-bold w-3">{i + 1}.</span>
                                <span className="text-[9px] text-zinc-300 truncate">{name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ),
    },
    {
        title: "Audio Snippet Previews",
        subtitle: "Listen before you dive in",
        description:
            "Every project can have an audio snippet so visitors can hear your sound instantly. A waveform player gives them a taste before they explore the stems.",
        render: () => (
            <div className="rounded-xl bg-zinc-900/80 p-5 md:p-6 min-h-[300px] flex flex-col gap-4">
                {/* Repo header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-glass-blue-400 to-violet-500 flex items-center justify-center">
                        <AudioLines className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-200">synthwave-odyssey</p>
                        <p className="text-xs text-zinc-500">by aiden.wav · Lo-fi, Synthwave</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1"><svg className="w-3 h-3 text-glass-cyan-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg> 42</span>
                        <span>12 remixes</span>
                    </div>
                </div>
                {/* WaveSurfer-style audio player (matching actual AudioPlayer) */}
                <div className="rounded-lg bg-zinc-900/95 border border-zinc-700/50 px-4 py-3 flex items-center gap-3">
                    {/* Play button with glass-blue gradient */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow" style={{ background: "linear-gradient(135deg, #A7C7E7, #9BBFE6, #A7C7E7)" }}>
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                    {/* Waveform bars */}
                    <div className="flex-1 flex items-center gap-[2px] h-12">
                        {Array.from({ length: 70 }).map((_, i) => {
                            const h = 15 + Math.sin(i * 0.25) * 30 + Math.cos(i * 0.65) * 20 + (i * 7 % 15);
                            const played = i < 28;
                            return (
                                <div key={i} className="flex-1 rounded-sm" style={{
                                    height: `${Math.max(h, 8)}%`,
                                    backgroundColor: played ? "#38bdf8" : "#64748b",
                                }} />
                            );
                        })}
                    </div>
                    {/* Timestamp */}
                    <span className="shrink-0 font-mono text-sm text-zinc-400">1:47 / 4:32</span>
                    {/* Volume icon */}
                    <div className="w-5 h-5 text-zinc-400">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.5H4a1 1 0 00-1 1v5a1 1 0 001 1h2.5l4 4V4.5l-4 4z" /></svg>
                    </div>
                </div>
                {/* Genre tags */}
                <div className="flex gap-2">
                    {["Lo-fi", "Synthwave", "Ambient"].map((g) => (
                        <span key={g} className="rounded-full bg-zinc-800 border border-white/5 px-2.5 py-1 text-[10px] text-zinc-400">{g}</span>
                    ))}
                </div>
                {/* Comment markers on timeline preview */}
                <div className="rounded-lg border border-white/5 bg-zinc-800/40 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-medium text-zinc-400">Comments</span>
                        <span className="text-[9px] text-zinc-600">3 comments on this snippet</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-zinc-700/50">
                        {[22, 48, 73].map((pos, i) => (
                            <div key={i} className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-glass-blue-400 border border-zinc-900" style={{ left: `${pos}%` }} />
                        ))}
                    </div>
                </div>
            </div>
        ),
    },
];

function DemoCarousel() {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const [direction, setDirection] = useState(0); // -1 left, 0 none, 1 right
    const dragRef = useRef({ startX: 0, isDragging: false });
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-advance
    useEffect(() => {
        if (paused) return;
        const timer = setInterval(() => {
            setDirection(1);
            setActive((prev) => (prev + 1) % DEMO_SLIDES.length);
        }, 7000);
        return () => clearInterval(timer);
    }, [paused]);

    const goTo = useCallback((index: number) => {
        setDirection(index > active ? 1 : -1);
        setActive(index);
    }, [active]);

    const goNext = useCallback(() => {
        setDirection(1);
        setActive((prev) => (prev + 1) % DEMO_SLIDES.length);
    }, []);

    const goPrev = useCallback(() => {
        setDirection(-1);
        setActive((prev) => (prev - 1 + DEMO_SLIDES.length) % DEMO_SLIDES.length);
    }, []);

    // Mouse drag / swipe
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, isDragging: true };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current.isDragging) return;
        const dx = e.clientX - dragRef.current.startX;
        dragRef.current.isDragging = false;
        if (Math.abs(dx) > 50) {
            if (dx < 0) goNext();
            else goPrev();
        }
    }, [goNext, goPrev]);

    const slide = DEMO_SLIDES[active]!;

    return (
        <div
            ref={containerRef}
            className="relative rounded-2xl border border-white/[0.08] bg-zinc-800/40 backdrop-blur-sm overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{ boxShadow: "0 0 80px rgba(167, 199, 231, 0.04)" }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current.isDragging = false; }}
        >
            {/* Slide content with animation */}
            <div
                key={active}
                className="transition-all duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]"
                style={{
                    animation: `${direction >= 0 ? "slideInRight" : "slideInLeft"} 0.5s cubic-bezier(0.19, 1, 0.22, 1)`,
                }}
            >
                <div className="px-5 md:px-8 pt-6 pb-3">
                    <p className="text-xs font-medium tracking-widest uppercase text-glass-blue-400 mb-2">{slide.subtitle}</p>
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{slide.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">{slide.description}</p>
                </div>
                <div className="px-3 md:px-6 pb-3">
                    {slide.render()}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between px-6 pb-5 pt-2">
                <div className="flex gap-2">
                    {DEMO_SLIDES.map((s, i) => (
                        <button
                            key={s.title}
                            onClick={() => goTo(i)}
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                                i === active
                                    ? "w-10 bg-glass-blue-400"
                                    : "w-2 bg-zinc-600 hover:bg-zinc-500"
                            }`}
                            aria-label={`Show ${s.title}`}
                        />
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={goPrev} className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/20 transition-colors" aria-label="Previous slide">
                        <ChevronDown className="w-4 h-4 rotate-90" />
                    </button>
                    <button onClick={goNext} className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/20 transition-colors" aria-label="Next slide">
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                    </button>
                </div>
            </div>

            {/* Inline keyframe styles */}
            <style jsx>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(40px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideInLeft {
                    from { opacity: 0; transform: translateX(-40px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}

// ── Navbar ─────────────────────────────────────────────────────────────────

function LandingNavbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                scrolled
                    ? "bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06]"
                    : "bg-transparent"
            }`}
        >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <Link
                    href="/"
                    className="text-xl font-semibold tracking-tight text-white hover:text-glass-blue-400 transition-colors no-underline"
                >
                    <span className="flex items-center gap-2.5">
                        <Waves className="w-6 h-6 text-glass-blue-400" />
                        SoundHaus
                    </span>
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    {[
                        { label: "Features", href: "#features" },
                        { label: "How It Works", href: "#how-it-works" },
                        { label: "Demo", href: "#demo" },
                        { label: "Get Started", href: "#download" },
                    ].map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            className="text-[13px] text-zinc-400 hover:text-white transition-colors no-underline"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <Link
                        href="/login"
                        className="text-[13px] text-zinc-400 hover:text-white transition-colors no-underline"
                    >
                        Log In
                    </Link>
                    <Link
                        href="/signup"
                        className="text-[13px] font-medium bg-white/10 hover:bg-white/15 text-white rounded-full px-5 py-2 transition-colors no-underline border border-white/[0.06]"
                    >
                        Sign Up
                    </Link>
                </div>
            </div>
        </nav>
    );
}

// ── Features + Steps data ──────────────────────────────────────────────────

const FEATURES = [
    {
        icon: GitBranch,
        title: "Version History",
        description:
            "Every save is a snapshot. Roll back to any version of your Ableton project without losing a single take.",
    },
    {
        icon: AudioLines,
        title: "Stem Separation",
        description:
            "Upload a mix, get isolated vocals, drums, bass, and melody tracks. Perfect for remixes, sampling, and collabs.",
    },
    {
        icon: BarChart3,
        title: "Visual Diff Engine",
        description:
            "See exactly what changed between versions — note-by-note on an Ableton-style piano roll. No more guessing.",
    },
];

const STEPS = [
    {
        icon: Upload,
        num: "01",
        title: "Sync Your Project",
        description:
            "Connect the SoundHaus desktop app to your Ableton project folder. Every save automatically versions your work.",
    },
    {
        icon: Eye,
        num: "02",
        title: "See Every Change",
        description:
            "Our visual diff engine shows note-level changes on a piano roll. Added notes in green, removed in red, modified in blue.",
    },
    {
        icon: Users,
        num: "03",
        title: "Collaborate Async",
        description:
            "Share your project, invite collaborators, and work together across time zones. No more emailing .als files.",
    },
];

// ── Landing Page ───────────────────────────────────────────────────────────

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
            <LandingNavbar />

            {/* ── Hero ────────────────────────────────────── */}
            <section className="relative min-h-screen flex items-center justify-center px-6">
                <AudioVisualizer />

                {/* Grain */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.02]"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "repeat",
                    }}
                    aria-hidden
                />

                {/* Radial glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(167, 199, 231, 0.06) 0%, transparent 70%)",
                    }}
                    aria-hidden
                />

                <div className="relative z-10 mx-auto max-w-5xl text-center">
                    <p className="text-xs font-medium tracking-[0.3em] uppercase text-glass-blue-400 mb-6 opacity-80">
                        Version control for music
                    </p>
                    <h1 className="mb-8 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95]">
                        Produce.<br />
                        <span className="text-glass-blue-400" style={{ textShadow: "0 0 40px rgba(167, 199, 231, 0.4)" }}>
                            Collaborate.
                        </span><br />
                        Evolve.
                    </h1>
                    <p className="mx-auto mb-12 max-w-lg text-base md:text-lg text-zinc-500 leading-relaxed font-light">
                        Seamless collaboration for Ableton projects.
                        Version, diff, and remix — see every note that changed.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <a
                            href="#download"
                            className="group flex items-center gap-2 bg-white text-zinc-900 font-semibold rounded-full px-8 py-3.5 text-sm transition-all duration-300 hover:bg-glass-blue-400 hover:shadow-[0_0_30px_rgba(167,199,231,0.3)] no-underline"
                        >
                            Get Started
                            <ChevronDown className="w-4 h-4 -rotate-90 transition-transform group-hover:translate-x-1" />
                        </a>
                        <a
                            href="#how-it-works"
                            className="flex items-center gap-2 border border-white/10 text-zinc-300 rounded-full px-8 py-3.5 text-sm font-medium transition-all duration-300 hover:border-white/20 hover:text-white no-underline"
                        >
                            See How It Works
                        </a>
                    </div>

                    <div className="mt-20 animate-bounce">
                        <ChevronDown className="mx-auto w-5 h-5 text-zinc-600" />
                    </div>
                </div>
            </section>

            {/* ── EQ Bars Divider ── */}
            <EQBarsDivider />

            {/* ── Features ───────────────────────────────── */}
            <section id="features" className="relative py-32 md:py-40 px-6">
                <FloatingParticles count={15} />
                <div className="mx-auto max-w-6xl relative z-10">
                    <FadeInSection className="text-center mb-20">
                        <p className="text-xs font-medium tracking-[0.3em] uppercase text-glass-blue-400 mb-4">Features</p>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
                            Everything you need to<br className="hidden sm:block" /> collaborate on music
                        </h2>
                        <p className="text-zinc-500 text-base max-w-lg mx-auto font-light">
                            Built by producers, for producers. SoundHaus bridges the gap between
                            music production and seamless collaboration.
                        </p>
                    </FadeInSection>

                    <div className="grid md:grid-cols-3 gap-6">
                        {FEATURES.map((feature, i) => (
                            <FadeInSection key={feature.title} delay={i * 100}>
                                <div className="group relative h-full rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-8 transition-all duration-500 hover:border-white/[0.12] hover:bg-zinc-900/80 flex flex-col">
                                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                         style={{ boxShadow: "0 0 60px rgba(167, 199, 231, 0.04)" }} />

                                    <div className="w-12 h-12 rounded-xl bg-glass-blue-400/10 flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110">
                                        <feature.icon className="w-6 h-6 text-glass-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-3 text-white">
                                        {feature.title}
                                    </h3>
                                    <p className="text-zinc-500 text-sm leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </FadeInSection>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Waveform Divider ── */}
            <WaveformDivider />

            {/* ── How It Works ───────────────────────────── */}
            <section id="how-it-works" className="relative py-32 md:py-40 px-6">
                {/* Subtle radial glow */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(167, 199, 231, 0.02) 0%, transparent 70%)" }} aria-hidden />
                <div className="mx-auto max-w-5xl relative z-10">
                    <FadeInSection className="text-center mb-20">
                        <p className="text-xs font-medium tracking-[0.3em] uppercase text-glass-blue-400 mb-4">How It Works</p>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
                            Three steps to better collaboration
                        </h2>
                        <p className="text-zinc-500 text-base max-w-lg mx-auto font-light">
                            Stop emailing zip files. Start producing together, asynchronously.
                        </p>
                    </FadeInSection>

                    <div className="grid md:grid-cols-3 gap-12 md:gap-8">
                        {STEPS.map((step, i) => (
                            <FadeInSection key={step.title} delay={i * 120}>
                                <div className="relative text-center group">
                                    <div className="text-5xl font-black text-zinc-800 mb-4 transition-colors duration-500 group-hover:text-zinc-700">
                                        {step.num}
                                    </div>
                                    <div className="relative z-10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 border border-white/[0.08]"
                                         style={{ boxShadow: "0 0 30px rgba(167, 199, 231, 0.06)" }}>
                                        <step.icon className="w-6 h-6 text-glass-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-white mb-2">
                                        {step.title}
                                    </h3>
                                    <p className="text-zinc-500 text-sm leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </FadeInSection>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── EQ Bars Divider ── */}
            <EQBarsDivider />

            {/* ── Demo Carousel ──────────────────────────── */}
            <section id="demo" className="relative py-32 md:py-40 px-6">
                <FloatingParticles count={12} color="130, 160, 210" />
                <div className="mx-auto max-w-5xl relative z-10">
                    <FadeInSection className="text-center mb-16">
                        <p className="text-xs font-medium tracking-[0.3em] uppercase text-glass-blue-400 mb-4">Demo</p>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
                            See SoundHaus in action
                        </h2>
                        <p className="text-zinc-500 text-base max-w-lg mx-auto font-light">
                            From visual diffs to collaborative discovery — explore the tools
                            that make music production seamless.
                        </p>
                    </FadeInSection>

                    <FadeInSection delay={150}>
                        <DemoCarousel />
                    </FadeInSection>
                </div>
            </section>

            {/* ── Waveform Divider (flipped) ── */}
            <WaveformDivider flip />

            {/* ── Download + CTA (Combined Bottom Section) ── */}
            <section id="download" className="relative py-32 md:py-40 px-6">
                <FloatingParticles count={10} color="167, 199, 231" />
                <div className="mx-auto max-w-6xl relative z-10">
                    <FadeInSection className="text-center mb-20">
                        <p className="text-xs font-medium tracking-[0.3em] uppercase text-glass-blue-400 mb-4">Get Started</p>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                            Ready to level up<br className="hidden sm:block" /> your workflow?
                        </h2>
                        <p className="text-zinc-500 text-base max-w-lg mx-auto font-light mb-12">
                            Join producers already using SoundHaus to version, share, and
                            collaborate on their music.
                        </p>

                        {/* Create Account CTA */}
                        <Link
                            href="/signup"
                            className="inline-flex items-center gap-2 bg-white text-zinc-900 font-semibold rounded-full px-10 py-4 text-base transition-all duration-300 hover:bg-glass-blue-400 hover:shadow-[0_0_40px_rgba(167,199,231,0.3)] no-underline mb-16"
                        >
                            Create Your Account
                            <ChevronDown className="w-4 h-4 -rotate-90" />
                        </Link>
                    </FadeInSection>

                    {/* Desktop App Download */}
                    <FadeInSection delay={200}>
                        <div className="relative rounded-2xl border border-white/[0.06] bg-zinc-900/50 overflow-hidden" style={{ boxShadow: "0 0 100px rgba(167, 199, 231, 0.03)" }}>
                            <div className="grid md:grid-cols-2 gap-0">
                                {/* Left: Desktop mockup */}
                                <div className="flex items-center justify-center p-10 md:p-14 bg-zinc-950/50">
                                    <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-zinc-900 p-5 shadow-2xl">
                                        <div className="flex items-center gap-1.5 mb-4">
                                            <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                            <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                            <span className="ml-2 text-[10px] text-zinc-600 font-mono">SoundHaus Desktop</span>
                                        </div>
                                        {[
                                            { name: "summer-ep-2025", status: "Synced", color: "#22C55E" },
                                            { name: "collab-remix-v3", status: "2 ahead", color: "#F59E0B" },
                                            { name: "drum-kit-vol2", status: "Synced", color: "#22C55E" },
                                        ].map((p) => (
                                            <div key={p.name} className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-800/50 px-4 py-3 mb-2 last:mb-0">
                                                <div className="flex items-center gap-3">
                                                    <Monitor className="w-4 h-4 text-glass-blue-400" />
                                                    <span className="text-sm text-zinc-200 font-medium">{p.name}</span>
                                                </div>
                                                <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ color: p.color, backgroundColor: `${p.color}15` }}>
                                                    {p.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: download info */}
                                <div className="flex flex-col justify-center p-10 md:p-14">
                                    <h3 className="text-2xl font-bold text-white mb-3">
                                        Download the Desktop App
                                    </h3>
                                    <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                                        Manage your Ableton projects locally. Sync, version, and collaborate — all from a native desktop app. No terminal required.
                                    </p>

                                    <div className="space-y-3 mb-8">
                                        {/* macOS — transparent gray with real Apple logo */}
                                        <a
                                            href="/downloads/SoundHaus-latest.dmg"
                                            className="flex items-center justify-center gap-3 w-full rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium py-3.5 px-6 transition-all duration-300 no-underline backdrop-blur-sm"
                                        >
                                            <AppleLogo className="w-5 h-5" />
                                            Download for macOS
                                        </a>
                                        {/* Windows — same transparent gray */}
                                        <a
                                            href="/downloads/SoundHaus-latest.exe"
                                            className="flex items-center justify-center gap-3 w-full rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium py-3.5 px-6 transition-all duration-300 no-underline backdrop-blur-sm"
                                        >
                                            <Download className="w-5 h-5" />
                                            Download for Windows
                                        </a>
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-zinc-600">
                                        <span>v0.2.0</span>
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <span>macOS 12+ / Windows 10+</span>
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <span>~120 MB</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </FadeInSection>
                </div>
            </section>

            {/* ── Footer ─────────────────────────────────── */}
            <footer className="border-t border-white/[0.04] py-12 px-6">
                <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2.5 text-zinc-500">
                        <Waves className="w-5 h-5 text-glass-blue-400" />
                        <span className="font-semibold text-zinc-300">SoundHaus</span>
                        <span className="text-xs">
                            &copy; {new Date().getFullYear()}
                        </span>
                    </div>

                    <div className="flex items-center gap-8 text-xs text-zinc-600">
                        <a href="#features" className="hover:text-zinc-300 transition-colors no-underline">Features</a>
                        <a href="#how-it-works" className="hover:text-zinc-300 transition-colors no-underline">How It Works</a>
                        <a href="#demo" className="hover:text-zinc-300 transition-colors no-underline">Demo</a>
                        <a href="#download" className="hover:text-zinc-300 transition-colors no-underline">Get Started</a>
                        <Link href="/login" className="hover:text-zinc-300 transition-colors no-underline">Log In</Link>
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors no-underline">
                            <Github className="w-3.5 h-3.5" />
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

