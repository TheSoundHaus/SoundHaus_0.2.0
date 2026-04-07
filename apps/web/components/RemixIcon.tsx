"use client";

/**
 * RemixIcon — Animated SVG that morphs from a download arrow into the
 * crossfade symbol.
 *
 * Download exit: translateX + opacity (no strokeDash, eliminates the dot
 * artifact caused by round linecaps bleeding past a fully-offset dash).
 *
 * Crossfade entry: strokeDashoffset draw-in with a hidden-via-opacity
 * guard so elements are truly invisible before their draw starts.
 */

interface RemixIconProps {
  hovered: boolean;
  size?: number;
}

export default function RemixIcon({ hovered, size = 18 }: RemixIconProps) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const dash = {
    ...stroke,
    pathLength: 1,
    strokeDasharray: 1,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ overflow: "visible" }}
    >
      {/* ── DOWNLOAD ARROW: fades out — parent span handles position movement ── */}
      <g
        style={{
          opacity: hovered ? 0 : 1,
          transition: hovered
            ? "opacity 140ms ease-in"
            : "opacity 200ms ease-out 60ms",
        }}
      >
        <line x1="12" y1="3" x2="12" y2="15" {...stroke} />
        <path d="M7 10 L12 15 L17 10" {...stroke} />
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...stroke} />
      </g>

      {/* ── CROSSFADE SYMBOL: snakes in after download exits ── */}

      {/* opacity guard prevents elements from showing before their draw starts */}

      {/* Curve 1: bottom-left → top-right */}
      <path
        d="M3 18 C7 18 9 6 13 6 L21 6"
        {...dash}
        style={{
          strokeDashoffset: hovered ? 0 : 1,
          opacity: hovered ? 1 : 0,
          transition: hovered
            ? "stroke-dashoffset 250ms cubic-bezier(0.4,0,0.2,1) 80ms, opacity 0ms 80ms"
            : "opacity 90ms ease-out, stroke-dashoffset 0ms 90ms",
        }}
      />

      {/* Arrowhead 1 — top-right */}
      <path
        d="M17 2 L21 6 L17 10"
        {...dash}
        style={{
          strokeDashoffset: hovered ? 0 : 1,
          opacity: hovered ? 1 : 0,
          transition: hovered
            ? "stroke-dashoffset 120ms ease-out 290ms, opacity 0ms 290ms"
            : "opacity 90ms ease-out, stroke-dashoffset 0ms 90ms",
        }}
      />

      {/* Curve 2: top-left → bottom-right (snakes in slightly behind) */}
      <path
        d="M3 6 C7 6 9 18 13 18 L21 18"
        {...dash}
        style={{
          strokeDashoffset: hovered ? 0 : -1,
          opacity: hovered ? 1 : 0,
          transition: hovered
            ? "stroke-dashoffset 250ms cubic-bezier(0.4,0,0.2,1) 110ms, opacity 0ms 110ms"
            : "opacity 90ms ease-out, stroke-dashoffset 0ms 90ms",
        }}
      />

      {/* Arrowhead 2 — bottom-right */}
      <path
        d="M17 14 L21 18 L17 22"
        {...dash}
        style={{
          strokeDashoffset: hovered ? 0 : 1,
          opacity: hovered ? 1 : 0,
          transition: hovered
            ? "stroke-dashoffset 120ms ease-out 310ms, opacity 0ms 310ms"
            : "opacity 90ms ease-out, stroke-dashoffset 0ms 90ms",
        }}
      />
    </svg>
  );
}
