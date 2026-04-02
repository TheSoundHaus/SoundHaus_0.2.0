"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from "lucide-react";

interface ImageCropperProps {
  src: string;
  aspectRatio?: number; // width/height, e.g. 1 for square, 16/9 for widescreen
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
  cropLabel?: string;
}

export default function ImageCropper({
  src,
  aspectRatio = 1,
  onCrop,
  onCancel,
  cropLabel = "Crop & Save",
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);

  // Load the image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // Draw the image on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, cw, ch);

    // Scale image to fit, then apply zoom
    const scale = Math.max(cw / img.width, ch / img.height) * zoom;
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2 + offset.x;
    const dy = (ch - dh) / 2 + offset.y;

    ctx.drawImage(img, dx, dy, dw, dh);
  }, [zoom, offset]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [imgLoaded, draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(5, z - e.deltaY * 0.002)));
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (e.touches.length === 1 && touch) {
      setDragging(true);
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!dragging || e.touches.length !== 1 || !touch) return;
    setOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
  };

  const handleCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
      },
      "image/jpeg",
      0.92
    );
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Canvas size — 300x300 for square, adjust for aspect ratio
  const canvasSize = 300;
  const cw = aspectRatio >= 1 ? canvasSize : Math.round(canvasSize * aspectRatio);
  const ch = aspectRatio >= 1 ? Math.round(canvasSize / aspectRatio) : canvasSize;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-zinc-100">Adjust Image</h3>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="relative mx-auto overflow-hidden rounded-lg border border-zinc-700"
          style={{ width: cw, height: ch, cursor: dragging ? "grabbing" : "grab" }}
        >
          <canvas
            ref={canvasRef}
            width={cw}
            height={ch}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setDragging(false)}
            className="block"
          />
          {/* Circular overlay for square crops (avatars) */}
          {aspectRatio === 1 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "radial-gradient(circle, transparent 48%, rgba(0,0,0,0.6) 49%)",
              }}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="rounded-md border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ZoomOut size={16} />
          </button>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={50}
              max={500}
              value={zoom * 100}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-glass-blue"
            />
            <span className="text-xs text-zinc-400 w-10 text-right">{Math.round(zoom * 100)}%</span>
          </div>
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.2))}
            className="rounded-md border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleReset}
            className="rounded-md border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Reset"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <X size={14} /> Cancel
          </button>
          <button
            onClick={handleCrop}
            className="flex items-center gap-1.5 rounded-lg bg-glass-blue px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-glass-blue/25 transition-colors hover:bg-glass-blue/90"
          >
            <Check size={14} /> {cropLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
