"use client";

import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";

/**
 * MiniAudioPreview — tiny waveform that auto-plays on mount.
 * Used for hover previews on RepositoryCard.
 * Height: 24px, no controls, fade-in/out via CSS.
 */
interface MiniAudioPreviewProps {
    snippetUrl: string;
}

export default function MiniAudioPreview({ snippetUrl }: MiniAudioPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: "rgba(96, 165, 250, 0.4)",    // glass-blue-400 at 40%
            progressColor: "rgba(96, 165, 250, 0.8)", // glass-blue-400 at 80%
            cursorColor: "transparent",
            height: 24,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
            normalize: true,
            interact: false,
        });

        wsRef.current = ws;

        ws.load(snippetUrl).catch((err) => {
            if (err.name !== "AbortError") {
                console.error("MiniAudioPreview load error:", err);
            }
        });

        ws.on("ready", () => {
            ws.setVolume(0.3);
            ws.play().catch(() => {});
            setVisible(true);
        });

        ws.on("finish", () => {
            // Loop playback
            ws.seekTo(0);
            ws.play().catch(() => {});
        });

        return () => {
            ws.destroy();
            wsRef.current = null;
        };
    }, [snippetUrl]);

    return (
        <div
            className={`transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        >
            <div ref={containerRef} className="w-full" />
        </div>
    );
}
