"use client";

import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import { Waves } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Animated EQ visualizer canvas for the login image panel
 */
function LoginVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let time = 0;

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

        // Particles
        const particles = Array.from({ length: 30 }).map(() => ({
            x: Math.random(),
            y: Math.random(),
            size: 0.5 + Math.random() * 2,
            speedX: (Math.random() - 0.5) * 0.0004,
            speedY: -0.0002 - Math.random() * 0.0004,
            alpha: 0.04 + Math.random() * 0.08,
            phase: Math.random() * Math.PI * 2,
        }));

        const draw = () => {
            const w = canvas.getBoundingClientRect().width;
            const h = canvas.getBoundingClientRect().height;
            ctx.clearRect(0, 0, w, h);

            // Floating particles
            particles.forEach((p) => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
                if (p.x < -0.05 || p.x > 1.05) p.x = Math.random();

                const wobble = Math.sin(time * 0.01 + p.phase) * 0.003;
                const px = (p.x + wobble) * w;
                const py = p.y * h;
                const flickerAlpha = p.alpha + Math.sin(time * 0.02 + p.phase) * 0.03;

                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 199, 231, ${Math.max(flickerAlpha, 0)})`;
                ctx.fill();
            });

            // EQ bars along the bottom
            const barCount = 60;
            const barWidth = w / barCount;
            const maxBarHeight = h * 0.25;
            for (let i = 0; i < barCount; i++) {
                const freq1 = Math.sin(time * 0.02 + i * 0.2) * 0.5 + 0.5;
                const freq2 = Math.cos(time * 0.015 + i * 0.35) * 0.3 + 0.5;
                const barH = (freq1 * 0.6 + freq2 * 0.4) * maxBarHeight;

                const x = i * barWidth;
                const alpha = 0.06 + freq1 * 0.06;
                ctx.fillStyle = `rgba(167, 199, 231, ${alpha})`;
                ctx.fillRect(x, h - barH, barWidth - 1, barH);
            }

            // Pulse ring
            const cx = w * 0.5;
            const cy = h * 0.45;
            for (let r = 0; r < 3; r++) {
                const radius = 60 + r * 50 + Math.sin(time * 0.015 + r * 1.5) * 20;
                const alpha = 0.04 + Math.sin(time * 0.012 + r * 2) * 0.02;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(167, 199, 231, ${Math.max(alpha, 0)})`;
                ctx.lineWidth = 1;
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

    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[2]" aria-hidden />;
}

/**
 * Login Page - Studio-grade aesthetic
 * Left: sign-in form with clean zinc design
 * Right: blurred studio photography with glass overlay + animated visualizer
 */
export default function LoginPage() {
    return (
        <div className="min-h-screen flex bg-zinc-950">
            {/* Subtle noise texture overlay */}
            <div className="fixed inset-0 opacity-[0.015] pointer-events-none"
                 style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'}}
            />

            {/* Left Content Container - Sign In Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8 relative z-10">
                <div className="w-full max-w-md">
                    {/* Logo/Brand */}
                    <div className="mb-12">
                        <Link href="/" className="inline-flex items-center gap-2 group">
                            <Waves className="w-7 h-7 text-glass-blue-400 transition-transform duration-300 group-hover:scale-110" />
                            <h1 className="text-3xl font-bold text-zinc-50 tracking-tight transition-all duration-300 group-hover:text-glass-blue">
                                Sound<span className="text-glass-blue">Haus</span>
                            </h1>
                        </Link>
                    </div>

                    {/* Header section */}
                    <div className="mb-8">
                        <h2 className="text-4xl text-zinc-50 font-semibold mb-2 tracking-tight">
                            Welcome Back
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Sign in to continue your session
                        </p>
                    </div>

                    {/* Forgot password link */}
                    <div className="flex justify-end mb-4">
                        <Link
                            href="/forgot-password"
                            className="text-sm text-glass-blue hover:text-glass-highlight transition-all duration-300 hover:underline underline-offset-4"
                        >
                            Forgot password?
                        </Link>
                    </div>

                    <LoginForm />

                    {/* Sign up link */}
                    <div className="mt-6 pt-6 border-t border-zinc-800/50">
                        <p className="text-center text-base text-zinc-400">
                            Don't have an account?{" "}
                            <Link
                                href="/signup"
                                className="text-glass-blue hover:text-glass-highlight transition-colors duration-300 font-semibold hover:underline underline-offset-4"
                            >
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Content Container - Studio Image + Animated Visualizer */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Studio photograph background with blur */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage: 'url("https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1920&q=80")',
                        filter: "blur(2px) brightness(0.35)",
                    }}
                />

                {/* Gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent" />

                {/* Animated visualizer overlay */}
                <LoginVisualizer />

                {/* Bottom branding on image side */}
                <div className="absolute bottom-8 left-8 right-8 z-10">
                    <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
                        Collaboration built for music producers.
                        Version, share, and remix — see every note that changed.
                    </p>
                </div>

                {/* Subtle glass-blue accent glow */}
                <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px]
                              bg-glass-blue/8 rounded-full blur-[100px]" />
            </div>
        </div>
    );
}
