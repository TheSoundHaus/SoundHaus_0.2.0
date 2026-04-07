"use client";

import { useEffect, useRef, useCallback } from "react";

interface CursorGlowProps {
    /** Primary glow color as HSL values, e.g. "210, 60%, 78%" */
    color?: string;
    /** Secondary accent color */
    accent?: string;
    /** Glow radius in pixels */
    radius?: number;
    /** Opacity of the glow (0-1) */
    intensity?: number;
}

export default function CursorGlow({
    color = "210, 60%, 78%",
    accent = "190, 70%, 65%",
    radius = 600,
    intensity = 0.07,
}: CursorGlowProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -1000, y: -1000 });
    const targetRef = useRef({ x: -1000, y: -1000 });
    const rafRef = useRef<number>(0);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Smooth interpolation (easing toward target)
        const lerp = 0.08;
        mouseRef.current.x += (targetRef.current.x - mouseRef.current.x) * lerp;
        mouseRef.current.y += (targetRef.current.y - mouseRef.current.y) * lerp;

        const { x, y } = mouseRef.current;
        const dpr = window.devicePixelRatio || 1;

        // Resize canvas if needed
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }

        ctx.clearRect(0, 0, rect.width, rect.height);

        // Primary glow
        const grad1 = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad1.addColorStop(0, `hsla(${color}, ${intensity})`);
        grad1.addColorStop(0.4, `hsla(${color}, ${intensity * 0.4})`);
        grad1.addColorStop(1, `hsla(${color}, 0)`);
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Secondary accent glow (offset and smaller)
        const grad2 = ctx.createRadialGradient(
            x + radius * 0.3, y - radius * 0.2, 0,
            x + radius * 0.3, y - radius * 0.2, radius * 0.5
        );
        grad2.addColorStop(0, `hsla(${accent}, ${intensity * 0.5})`);
        grad2.addColorStop(1, `hsla(${accent}, 0)`);
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, rect.width, rect.height);

        rafRef.current = requestAnimationFrame(animate);
    }, [color, accent, radius, intensity]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            targetRef.current = { x: e.clientX, y: e.clientY + window.scrollY };
        };

        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            cancelAnimationFrame(rafRef.current);
        };
    }, [animate]);

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none fixed inset-0 z-0"
            style={{ width: "100%", height: "100%" }}
            aria-hidden
        />
    );
}
