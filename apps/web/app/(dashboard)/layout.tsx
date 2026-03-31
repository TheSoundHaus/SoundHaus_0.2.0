"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { UserProvider } from "@/lib/context/UserContext";
import {
    useKeyboardShortcuts,
    createDefaultShortcuts,
} from "@/hooks/useKeyboardShortcuts";

/**
 * Subtle floating particles background for dashboard pages
 */
function AmbientParticles() {
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
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener("resize", resize);

        const particles = Array.from({ length: 25 }).map(() => ({
            x: Math.random(),
            y: Math.random(),
            size: 0.4 + Math.random() * 1.5,
            speedX: (Math.random() - 0.5) * 0.0002,
            speedY: -0.0001 - Math.random() * 0.0003,
            alpha: 0.03 + Math.random() * 0.05,
            phase: Math.random() * Math.PI * 2,
        }));

        const draw = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            ctx.clearRect(0, 0, w, h);

            particles.forEach((p) => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
                if (p.x < -0.05 || p.x > 1.05) p.x = Math.random();

                const wobble = Math.sin(time * 0.008 + p.phase) * 0.002;
                const px = (p.x + wobble) * w;
                const py = p.y * h;
                const flicker = p.alpha + Math.sin(time * 0.015 + p.phase) * 0.02;

                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 199, 231, ${Math.max(flicker, 0)})`;
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
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" aria-hidden />;
}

/**
 * Dashboard Layout - Wrapper for all authenticated dashboard pages
 * Provides consistent navigation via Navbar, user profile context,
 * and global keyboard shortcuts.
 */
export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    const toggleShortcuts = useCallback(
        () => setShortcutsOpen((prev) => !prev),
        [],
    );

    const shortcuts = createDefaultShortcuts({
        showHelp: toggleShortcuts,
    });

    useKeyboardShortcuts(shortcuts);

    return (
        <UserProvider>
            <div className="min-h-screen bg-zinc-950 text-zinc-100 relative">
                {/* Ambient floating particles */}
                <AmbientParticles />

                {/* Subtle ambient glow orbs */}
                <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-glass-blue/[0.03] rounded-full blur-[150px] pointer-events-none z-0" />
                <div className="fixed bottom-1/3 right-1/5 w-[400px] h-[400px] bg-glass-blue/[0.02] rounded-full blur-[120px] pointer-events-none z-0" />

                <Navbar />
                <main className="relative z-10">{children}</main>
                <KeyboardShortcutsModal
                    open={shortcutsOpen}
                    onClose={() => setShortcutsOpen(false)}
                    shortcuts={shortcuts}
                />
            </div>
        </UserProvider>
    );
}