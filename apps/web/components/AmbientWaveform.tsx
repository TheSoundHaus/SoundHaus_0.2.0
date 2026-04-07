"use client";

import { useEffect, useRef } from "react";

/**
 * AmbientWaveform — a subtle, slowly undulating waveform that lives
 * in the background of the dashboard. It's drawn on a canvas with very
 * low opacity so it's visible through glass-card elements but never
 * distracting. No cursor tracking — purely ambient.
 */
export default function AmbientWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      // Draw 3 layered waveforms with different speeds and opacities
      const waves = [
        { amp: 40, freq: 0.003, speed: 0.0015, opacity: 0.055, yOffset: 0.45 },
        { amp: 25, freq: 0.005, speed: 0.0025, opacity: 0.04, yOffset: 0.50 },
        { amp: 55, freq: 0.002, speed: 0.001, opacity: 0.035, yOffset: 0.55 },
      ];

      for (const wave of waves) {
        ctx.beginPath();
        const baseY = h * wave.yOffset;

        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            Math.sin(x * wave.freq + t * wave.speed) * wave.amp +
            Math.sin(x * wave.freq * 2.3 + t * wave.speed * 1.7) * wave.amp * 0.4;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Create gradient stroke
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(167, 199, 231, 0)`);
        grad.addColorStop(0.2, `rgba(167, 199, 231, ${wave.opacity})`);
        grad.addColorStop(0.5, `rgba(167, 199, 231, ${wave.opacity * 1.5})`);
        grad.addColorStop(0.8, `rgba(167, 199, 231, ${wave.opacity})`);
        grad.addColorStop(1, `rgba(167, 199, 231, 0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fill below the wave with a very subtle gradient
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        const fillGrad = ctx.createLinearGradient(0, baseY, 0, h);
        fillGrad.addColorStop(0, `rgba(167, 199, 231, ${wave.opacity * 0.3})`);
        fillGrad.addColorStop(1, `rgba(167, 199, 231, 0)`);
        ctx.fillStyle = fillGrad;
        ctx.fill();
      }

      // Ambient glow orb — stationary, softly pulsing
      const pulseRadius = 300 + Math.sin(t * 0.002) * 50;
      const orbGrad = ctx.createRadialGradient(
        w * 0.3, h * 0.4, 0,
        w * 0.3, h * 0.4, pulseRadius
      );
      orbGrad.addColorStop(0, "rgba(167, 199, 231, 0.035)");
      orbGrad.addColorStop(0.5, "rgba(167, 199, 231, 0.015)");
      orbGrad.addColorStop(1, "rgba(167, 199, 231, 0)");
      ctx.fillStyle = orbGrad;
      ctx.fillRect(0, 0, w, h);

      t++;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 1 }}
      aria-hidden="true"
    />
  );
}
