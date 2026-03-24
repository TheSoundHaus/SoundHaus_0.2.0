"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";

// ── Animated waveform background ───────────────────────────────────────────

function WaveformBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let time = 0;

        const resize = () => {
            canvas.width = window.innerWidth * 2;
            canvas.height = window.innerHeight * 2;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        resize();
        window.addEventListener("resize", resize);

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Draw multiple layered sine waves
            const waves = [
                { amp: 60, freq: 0.003, speed: 0.008, opacity: 0.06, yOffset: 0.5 },
                { amp: 40, freq: 0.005, speed: 0.012, opacity: 0.04, yOffset: 0.48 },
                { amp: 80, freq: 0.002, speed: 0.006, opacity: 0.03, yOffset: 0.52 },
                { amp: 30, freq: 0.007, speed: 0.015, opacity: 0.05, yOffset: 0.46 },
            ];

            for (const wave of waves) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(167, 199, 231, ${wave.opacity})`;
                ctx.lineWidth = 2;

                for (let x = 0; x < w; x += 2) {
                    const y =
                        h * wave.yOffset +
                        Math.sin(x * wave.freq + time * wave.speed) * wave.amp +
                        Math.sin(x * wave.freq * 1.5 + time * wave.speed * 0.7) * wave.amp * 0.3;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            time++;
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
            className="absolute inset-0 pointer-events-none"
            aria-hidden
        />
    );
}

// ── Intersection Observer hook for fade-in ─────────────────────────────────

function useFadeIn() {
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
            { threshold: 0.15 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

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
            className={`transition-all duration-700 ease-out ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            } ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
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
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                scrolled
                    ? "bg-zinc-900/95 backdrop-blur-md border-b border-white/10 shadow-lg"
                    : "bg-transparent"
            }`}
        >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <Link
                    href="/"
                    className="text-2xl font-bold tracking-tight text-white hover:text-glass-blue-400 transition-colors"
                    style={{ textShadow: "0 0 20px rgba(167, 199, 231, 0.3)" }}
                >
                    <span className="flex items-center gap-2">
                        <Waves className="w-7 h-7 text-glass-blue-400" />
                        SoundHaus
                    </span>
                </Link>

                {/* Anchor links */}
                <div className="hidden md:flex items-center gap-6">
                    <a
                        href="#features"
                        className="text-sm text-zinc-400 hover:text-white transition-colors no-underline"
                    >
                        Features
                    </a>
                    <a
                        href="#how-it-works"
                        className="text-sm text-zinc-400 hover:text-white transition-colors no-underline"
                    >
                        How It Works
                    </a>
                    <a
                        href="#demo"
                        className="text-sm text-zinc-400 hover:text-white transition-colors no-underline"
                    >
                        Demo
                    </a>
                </div>

                {/* CTAs */}
                <div className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="text-sm text-zinc-300 hover:text-white transition-colors no-underline"
                    >
                        Log In
                    </Link>
                    <Link
                        href="/signup"
                        className="btn btn-primary btn-sm !min-h-0 !py-2 !px-5 text-sm"
                    >
                        Sign Up Free
                    </Link>
                </div>
            </div>
        </nav>
    );
}

// ── Features data ──────────────────────────────────────────────────────────

const FEATURES = [
    {
        icon: GitBranch,
        title: "Git-Powered Versioning",
        description:
            "Every save is a snapshot. Branch, merge, and rollback your Ableton projects like code — without losing a single take.",
    },
    {
        icon: AudioLines,
        title: "AI Stem Separation",
        description:
            "Upload a mix, get isolated vocals, drums, bass, and melody tracks powered by Demucs. Perfect for remixes and collabs.",
    },
    {
        icon: BarChart3,
        title: "Visual Diff Engine",
        description:
            "See exactly what changed between versions — note-by-note on an Ableton-style piano roll. No more guessing what your collaborator modified.",
    },
];

// ── How It Works data ──────────────────────────────────────────────────────

const STEPS = [
    {
        icon: Upload,
        title: "Push Your Project",
        description:
            "Connect the SoundHaus desktop app to your Ableton project folder. Every save automatically versions your work.",
    },
    {
        icon: Eye,
        title: "See Every Change",
        description:
            "Our visual diff engine shows note-level changes on a piano roll — added notes in green, removed in red, modified in blue.",
    },
    {
        icon: Users,
        title: "Collaborate Async",
        description:
            "Share your repo, invite collaborators, and work on the same project across time zones. No more emailing .als files.",
    },
];

// ── Landing Page ───────────────────────────────────────────────────────────

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 overflow-x-hidden">
            <LandingNavbar />

            {/* ── Hero Section ────────────────────────────── */}
            <section className="relative min-h-screen flex items-center justify-center px-6">
                {/* Animated waveform background */}
                <WaveformBackground />

                {/* Grain texture overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "repeat",
                    }}
                    aria-hidden
                />

                {/* Radial gradient glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(167, 199, 231, 0.08) 0%, transparent 70%)",
                    }}
                    aria-hidden
                />

                <div className="relative z-10 mx-auto max-w-4xl text-center">
                    <h1 className="mb-6 text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
                        Version Control for{" "}
                        <span
                            className="text-glass-blue-400"
                            style={{ textShadow: "0 0 30px rgba(167, 199, 231, 0.5)" }}
                        >
                            Music Producers
                        </span>
                    </h1>
                    <p className="mx-auto mb-10 max-w-2xl text-lg md:text-xl text-zinc-400 leading-relaxed">
                        SoundHaus brings git-powered collaboration to Ableton projects.
                        Push, diff, branch, and remix — see every note that changed.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/signup" className="btn btn-primary btn-lg text-base no-underline">
                            Get Started Free
                        </Link>
                        <a
                            href="#how-it-works"
                            className="btn btn-secondary btn-lg text-base no-underline"
                        >
                            See How It Works
                        </a>
                    </div>

                    {/* Scroll hint */}
                    <div className="mt-16 animate-bounce">
                        <ChevronDown className="mx-auto w-6 h-6 text-zinc-500" />
                    </div>
                </div>
            </section>

            {/* ── Features Grid ──────────────────────────── */}
            <section id="features" className="py-24 md:py-32 px-6">
                <div className="mx-auto max-w-6xl">
                    <FadeInSection className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Everything you need to collaborate on music
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                            Built by producers, for producers. SoundHaus bridges the gap between
                            music production and modern version control.
                        </p>
                    </FadeInSection>

                    <div className="grid md:grid-cols-3 gap-6">
                        {FEATURES.map((feature, i) => (
                            <FadeInSection key={feature.title} delay={i * 120}>
                                <div className="group relative rounded-xl border border-white/10 bg-zinc-800/50 p-8 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/80">
                                    {/* Glow on hover */}
                                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                                         style={{ boxShadow: "inset 0 1px 0 rgba(167, 199, 231, 0.1), 0 0 40px rgba(167, 199, 231, 0.05)" }} />

                                    <feature.icon className="w-10 h-10 text-glass-blue-400 mb-5 transition-transform duration-300 group-hover:scale-110" />
                                    <h3 className="text-xl font-semibold mb-3 text-white">
                                        {feature.title}
                                    </h3>
                                    <p className="text-zinc-400 leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </FadeInSection>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How It Works ───────────────────────────── */}
            <section
                id="how-it-works"
                className="py-24 md:py-32 px-6 border-t border-white/5"
            >
                <div className="mx-auto max-w-5xl">
                    <FadeInSection className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Three steps to better collaboration
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                            Stop emailing zip files. Start producing together — asynchronously.
                        </p>
                    </FadeInSection>

                    <div className="relative">
                        {/* Connecting line */}
                        <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-glass-blue-400/20 to-transparent -translate-y-1/2" />

                        <div className="grid md:grid-cols-3 gap-10 md:gap-8">
                            {STEPS.map((step, i) => (
                                <FadeInSection key={step.title} delay={i * 150}>
                                    <div className="relative text-center">
                                        {/* Step number */}
                                        <div className="relative z-10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-glass-blue-400/30 bg-zinc-900"
                                             style={{ boxShadow: "0 0 20px rgba(167, 199, 231, 0.1)" }}>
                                            <step.icon className="w-7 h-7 text-glass-blue-400" />
                                        </div>
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 text-[10px] font-bold text-glass-blue-400/60 uppercase tracking-widest">
                                            Step {i + 1}
                                        </span>
                                        <h3 className="text-lg font-semibold text-white mb-2">
                                            {step.title}
                                        </h3>
                                        <p className="text-zinc-400 text-sm leading-relaxed">
                                            {step.description}
                                        </p>
                                    </div>
                                </FadeInSection>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Demo / Screenshot Section ──────────────── */}
            <section
                id="demo"
                className="py-24 md:py-32 px-6 border-t border-white/5"
            >
                <div className="mx-auto max-w-5xl">
                    <FadeInSection className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            See SoundHaus in Action
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                            Our visual diff engine renders every MIDI change on an Ableton-style
                            piano roll — so you can see exactly what your collaborator changed.
                        </p>
                    </FadeInSection>

                    <FadeInSection delay={200}>
                        <div className="relative rounded-xl border border-white/10 bg-zinc-800/60 p-2 overflow-hidden"
                             style={{ boxShadow: "0 0 60px rgba(167, 199, 231, 0.06)" }}>
                            {/* Mock diff timeline preview */}
                            <div className="rounded-lg bg-zinc-900 p-6 min-h-[320px] flex flex-col gap-3">
                                {/* Header bar */}
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                    </div>
                                    <span className="text-xs text-zinc-500 font-mono">
                                        my-beat.als — commit a3f2c1d
                                    </span>
                                </div>

                                {/* Mock tracks */}
                                {[
                                    { name: "Drums", color: "#FF7C00", notes: [2, 6, 10, 14, 18, 22, 26, 30], type: "unchanged" },
                                    { name: "Bass", color: "#00CC6E", notes: [0, 8, 12, 20, 28], type: "modified" },
                                    { name: "Lead Synth", color: "#0059CC", notes: [4, 10, 16, 22, 24, 30], type: "added" },
                                ].map((track) => (
                                    <div key={track.name} className="flex items-stretch gap-0 rounded-lg overflow-hidden border border-white/5">
                                        {/* Label */}
                                        <div
                                            className="w-32 shrink-0 flex items-center gap-2 px-3 py-2 border-r border-white/5"
                                            style={{ backgroundColor: `${track.color}10` }}
                                        >
                                            <div
                                                className="w-1 h-6 rounded-full"
                                                style={{ backgroundColor: track.color }}
                                            />
                                            <span className="text-xs font-medium text-zinc-300 truncate">
                                                {track.name}
                                            </span>
                                        </div>
                                        {/* Piano roll preview */}
                                        <div className="flex-1 bg-zinc-950/50 relative h-12 overflow-hidden">
                                            {/* Grid lines */}
                                            <div className="absolute inset-0 flex">
                                                {Array.from({ length: 16 }).map((_, j) => (
                                                    <div
                                                        key={j}
                                                        className={`flex-1 border-r ${
                                                            j % 4 === 3
                                                                ? "border-white/10"
                                                                : "border-white/[0.03]"
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            {/* Mock notes */}
                                            {track.notes.map((pos, ni) => {
                                                const color =
                                                    track.type === "added"
                                                        ? "rgb(0, 255, 135)"
                                                        : track.type === "modified"
                                                        ? "rgb(60, 160, 255)"
                                                        : "rgb(140, 140, 150)";
                                                const glow =
                                                    track.type !== "unchanged"
                                                        ? `0 0 6px ${color}`
                                                        : "none";
                                                return (
                                                    <div
                                                        key={ni}
                                                        className="absolute rounded-sm"
                                                        style={{
                                                            left: `${(pos / 32) * 100}%`,
                                                            top: `${20 + (ni % 3) * 10}%`,
                                                            width: `${((2 + (ni % 2)) / 32) * 100}%`,
                                                            height: "24%",
                                                            backgroundColor: color,
                                                            opacity: track.type === "unchanged" ? 0.35 : 0.85,
                                                            boxShadow: glow,
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </FadeInSection>
                </div>
            </section>

            {/* ── CTA Banner ─────────────────────────────── */}
            <section className="py-20 px-6 border-t border-white/5">
                <FadeInSection>
                    <div className="mx-auto max-w-3xl text-center">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Ready to level up your workflow?
                        </h2>
                        <p className="text-zinc-400 text-lg mb-8">
                            Join producers already using SoundHaus to version, share, and
                            collaborate on their music.
                        </p>
                        <Link
                            href="/signup"
                            className="btn btn-primary btn-lg text-base no-underline"
                        >
                            Create Your Free Account
                        </Link>
                    </div>
                </FadeInSection>
            </section>

            {/* ── Footer ─────────────────────────────────── */}
            <footer className="border-t border-white/5 py-12 px-6 bg-zinc-950/50">
                <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2 text-zinc-400">
                        <Waves className="w-5 h-5 text-glass-blue-400" />
                        <span className="font-semibold text-white">SoundHaus</span>
                        <span className="text-sm">
                            &copy; {new Date().getFullYear()}
                        </span>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-zinc-500">
                        <a href="#features" className="hover:text-white transition-colors no-underline">
                            Features
                        </a>
                        <a href="#how-it-works" className="hover:text-white transition-colors no-underline">
                            How It Works
                        </a>
                        <Link href="/login" className="hover:text-white transition-colors no-underline">
                            Log In
                        </Link>
                        <a
                            href="https://github.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-white transition-colors no-underline"
                        >
                            <Github className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

