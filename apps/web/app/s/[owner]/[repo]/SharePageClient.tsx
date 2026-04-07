"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useMemo } from "react";
import {
    Waves,
    Play,
    Pause,
    Monitor,
    Star,
    GitFork,
    Music,
    ExternalLink,
    Copy,
    Check,
} from "lucide-react";
import type { RepoStats, Snippet } from "@/lib/types/api";

// ── Props ──────────────────────────────────────────────────────────────────

interface SharePageClientProps {
    owner: string;
    repo: string;
    stats: RepoStats | null;
    snippet: Snippet | null;
}

// ── Animated waveform background (same as landing but dimmer) ──────────────

function ShareWaveformBg() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let time = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        const draw = () => {
            time += 0.003;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const layers = [
                { amp: 25, freq: 0.003, speed: 1, alpha: 0.06 },
                { amp: 18, freq: 0.005, speed: 1.4, alpha: 0.04 },
                { amp: 12, freq: 0.008, speed: 0.8, alpha: 0.03 },
            ];

            for (const l of layers) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(167, 199, 231, ${l.alpha})`;
                ctx.lineWidth = 1.5;
                const cy = canvas.height * 0.5;
                for (let x = 0; x <= canvas.width; x += 3) {
                    const y =
                        cy +
                        Math.sin(x * l.freq + time * l.speed) * l.amp +
                        Math.sin(x * l.freq * 1.8 + time * l.speed * 0.7) * l.amp * 0.4;
                    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            aria-hidden
        />
    );
}

// ── Procedural waveform bars for snippet ──────────────────────────────────

function WaveformViz({ playing }: { playing: boolean }) {
    const bars = useMemo(() => {
        return Array.from({ length: 60 }, (_, i) => {
            const h =
                15 +
                Math.sin(i * 0.35) * 30 +
                Math.cos(i * 0.7) * 20 +
                ((i * 7) % 13);
            return Math.max(h, 8);
        });
    }, []);

    return (
        <div className="flex items-end gap-[2px] h-24 w-full">
            {bars.map((h, i) => (
                <div
                    key={i}
                    className="flex-1 rounded-sm transition-all duration-200"
                    style={{
                        height: `${h}%`,
                        backgroundColor:
                            playing && i < 30
                                ? "rgba(167, 199, 231, 0.7)"
                                : "rgba(100, 116, 139, 0.35)",
                        boxShadow:
                            playing && i < 30
                                ? "0 0 4px rgba(167, 199, 231, 0.3)"
                                : "none",
                    }}
                />
            ))}
        </div>
    );
}

// ── Share Page Client ─────────────────────────────────────────────────────

export default function SharePageClient({
    owner,
    repo,
    stats,
    snippet,
}: SharePageClientProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [copied, setCopied] = useState(false);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setPlaying(!playing);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onEnd = () => setPlaying(false);
        audio.addEventListener("ended", onEnd);
        return () => audio.removeEventListener("ended", onEnd);
    }, []);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    };

    const desktopDeepLink = `soundhaus://open/${owner}/${repo}`;
    const webLink = `/explore/${owner}/${repo}`;

    const genres = stats?.genres?.map((g) => g.genre_name) ?? [];
    const description = stats?.description || "A SoundHaus project";

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 overflow-x-hidden">
            <ShareWaveformBg />

            {/* Grain overlay */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                }}
                aria-hidden
            />

            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-900/80 backdrop-blur-md border-b border-white/5">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-white hover:text-glass-blue-400 transition-colors no-underline"
                    >
                        <Waves className="w-6 h-6 text-glass-blue-400" />
                        <span className="text-xl font-bold tracking-tight">SoundHaus</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/signup"
                            className="btn btn-primary btn-sm !min-h-0 !py-2 !px-5 text-sm no-underline"
                        >
                            Sign Up
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 pt-28 pb-20 px-6">
                <div className="mx-auto max-w-2xl">
                    {/* Project Card */}
                    <div
                        className="rounded-2xl border border-white/10 bg-zinc-800/70 backdrop-blur-sm overflow-hidden"
                        style={{
                            boxShadow:
                                "0 0 80px rgba(167, 199, 231, 0.06), 0 25px 50px rgba(0,0,0,0.4)",
                        }}
                    >
                        {/* Header gradient band */}
                        <div className="h-2 bg-gradient-to-r from-glass-blue-400 via-violet-500 to-glass-blue-400" />

                        <div className="p-8">
                            {/* Owner + repo */}
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-glass-blue-400 to-violet-500 flex items-center justify-center flex-shrink-0">
                                    <Music className="w-7 h-7 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-bold text-white truncate">
                                        {repo}
                                    </h1>
                                    <p className="text-sm text-zinc-400 mt-0.5">
                                        by{" "}
                                        <span className="text-glass-blue-400 font-medium">
                                            {owner}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-zinc-300 leading-relaxed mb-6">
                                {description}
                            </p>

                            {/* Genre tags */}
                            {genres.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {genres.map((g) => (
                                        <span
                                            key={g}
                                            className="rounded-full bg-glass-blue-400/10 border border-glass-blue-400/20 px-3 py-1 text-xs font-medium text-glass-blue-400"
                                        >
                                            {g}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Stats row */}
                            <div className="flex items-center gap-5 mb-8 text-sm text-zinc-400">
                                {stats && (
                                    <>
                                        <span className="flex items-center gap-1.5">
                                            <Star className="w-4 h-4 text-amber-400" />
                                            {stats.recent_clones?.length ?? 0} stars
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <GitFork className="w-4 h-4 text-glass-blue-400" />
                                            {stats.clone_count ?? 0} remixes
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Audio Player */}
                            {snippet?.url && (
                                <div className="rounded-xl bg-zinc-900/70 border border-white/5 p-5 mb-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <button
                                            onClick={togglePlay}
                                            className="w-12 h-12 rounded-full bg-glass-blue-400 hover:bg-glass-blue-300 transition-colors flex items-center justify-center flex-shrink-0"
                                        >
                                            {playing ? (
                                                <Pause className="w-5 h-5 text-zinc-900" />
                                            ) : (
                                                <Play className="w-5 h-5 text-zinc-900 ml-0.5" />
                                            )}
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white truncate">
                                                Audio Preview
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {snippet.format?.toUpperCase()}{" "}
                                                {snippet.duration
                                                    ? `· ${Math.round(snippet.duration)}s`
                                                    : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <WaveformViz playing={playing} />
                                    <audio ref={audioRef} src={snippet.url} preload="metadata" />
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="space-y-3">
                                {/* Open in Desktop */}
                                <a
                                    href={desktopDeepLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-glass-blue-400 hover:bg-glass-blue-300 text-zinc-900 font-semibold py-3.5 px-6 transition-colors no-underline text-center"
                                >
                                    <Monitor className="w-5 h-5" />
                                    Open in SoundHaus Desktop
                                </a>

                                {/* View on Web */}
                                <Link
                                    href={webLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-zinc-800/80 hover:bg-zinc-700/80 text-white font-medium py-3.5 px-6 transition-colors no-underline text-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View on SoundHaus
                                </Link>

                                {/* Copy Link */}
                                <button
                                    onClick={handleCopyLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/5 bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-white font-medium py-3 px-6 transition-colors"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 text-green-400" />
                                            <span className="text-green-400">Link Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            Copy Share Link
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* "Don't have the app?" nudge */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-zinc-500 mb-2">
                            Don&apos;t have the desktop app yet?
                        </p>
                        <a
                            href="#download"
                            onClick={(e) => {
                                e.preventDefault();
                                window.location.href = "/#download";
                            }}
                            className="text-sm text-glass-blue-400 hover:text-glass-blue-300 transition-colors font-medium no-underline"
                        >
                            Download SoundHaus for free &rarr;
                        </a>
                    </div>
                </div>
            </main>

            {/* Minimal Footer */}
            <footer className="relative z-10 border-t border-white/5 py-8 px-6">
                <div className="mx-auto max-w-2xl flex items-center justify-between text-sm text-zinc-500">
                    <div className="flex items-center gap-2">
                        <Waves className="w-4 h-4 text-glass-blue-400" />
                        <span className="font-semibold text-white">SoundHaus</span>
                        <span>&copy; {new Date().getFullYear()}</span>
                    </div>
                    <Link
                        href="/signup"
                        className="hover:text-white transition-colors no-underline"
                    >
                        Create Account
                    </Link>
                </div>
            </footer>
        </div>
    );
}
