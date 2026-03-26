"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Scissors, Check, X, GripVertical } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.js";

interface SnippetTrimmerProps {
    /** The original file the user dropped/selected */
    file: File;
    /** Max allowed duration in seconds */
    maxDuration: number;
    /** Called with the trimmed File when user confirms */
    onConfirm: (trimmedFile: File) => void;
    /** Called when user cancels */
    onCancel: () => void;
}

/**
 * SnippetTrimmer — lets users select a window of audio to upload
 * when the source file exceeds the max duration.
 *
 * Uses WaveSurfer with the Regions plugin for visual selection.
 * Trims client-side via Web Audio API before handing back a trimmed File.
 */
export default function SnippetTrimmer({
    file,
    maxDuration,
    onConfirm,
    onCancel,
}: SnippetTrimmerProps) {
    const waveformRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const regionRef = useRef<Region | null>(null);

    const [duration, setDuration] = useState(0);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(maxDuration);
    const [trimming, setTrimming] = useState(false);
    const [ready, setReady] = useState(false);

    const objectUrlRef = useRef<string | null>(null);

    // Initialize WaveSurfer
    useEffect(() => {
        if (!waveformRef.current) return;

        const regions = RegionsPlugin.create();
        regionsRef.current = regions;

        const ws = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: "#64748b",
            progressColor: "#64748b",
            cursorColor: "#ffffff40",
            height: 80,
            barWidth: 2,
            barGap: 1,
            normalize: true,
            interact: false,
            plugins: [regions],
        });

        wsRef.current = ws;
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;

        ws.load(url).catch((err) => {
            if (err.name !== "AbortError") console.error("WaveSurfer load error:", err);
        });

        ws.on("ready", () => {
            const dur = ws.getDuration();
            setDuration(dur);
            setEnd(Math.min(maxDuration, dur));
            setReady(true);

            // Create initial selection region
            const region = regions.addRegion({
                start: 0,
                end: Math.min(maxDuration, dur),
                color: "rgba(56, 189, 248, 0.15)",
                drag: true,
                resize: true,
            });
            regionRef.current = region;
        });

        // Sync region drag/resize back to state
        regions.on("region-updated", (region: Region) => {
            let newStart = region.start;
            let newEnd = region.end;
            const dur = ws.getDuration();

            // Enforce maxDuration constraint
            if (newEnd - newStart > maxDuration) {
                newEnd = newStart + maxDuration;
                region.setOptions({ start: newStart, end: newEnd });
            }

            // Clamp to bounds
            if (newStart < 0) {
                newStart = 0;
                newEnd = Math.min(maxDuration, dur);
                region.setOptions({ start: newStart, end: newEnd });
            }
            if (newEnd > dur) {
                newEnd = dur;
                newStart = Math.max(0, newEnd - maxDuration);
                region.setOptions({ start: newStart, end: newEnd });
            }

            setStart(newStart);
            setEnd(newEnd);
        });

        return () => {
            try {
                ws?.unAll();
                ws?.destroy();
            } catch {}
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
    }, [file, maxDuration]);

    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    // Play the selected region preview
    const playPreview = useCallback(() => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.setTime(start);
        ws.play();
        // Stop at end of selection
        const checkInterval = setInterval(() => {
            if (ws.getCurrentTime() >= end) {
                ws.pause();
                clearInterval(checkInterval);
            }
        }, 50);
    }, [start, end]);

    // Trim audio client-side using Web Audio API
    const handleConfirm = useCallback(async () => {
        setTrimming(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new AudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(start * sampleRate);
            const endSample = Math.floor(end * sampleRate);
            const length = endSample - startSample;
            const channels = audioBuffer.numberOfChannels;

            // Create trimmed buffer
            const trimmed = audioCtx.createBuffer(channels, length, sampleRate);
            for (let ch = 0; ch < channels; ch++) {
                const src = audioBuffer.getChannelData(ch);
                const dst = trimmed.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    dst[i] = src[startSample + i] ?? 0;
                }
            }

            // Encode to WAV
            const wav = audioBufferToWav(trimmed);
            const trimmedFile = new File([wav], file.name.replace(/\.[^.]+$/, ".wav"), {
                type: "audio/wav",
            });

            await audioCtx.close();
            onConfirm(trimmedFile);
        } catch (err) {
            console.error("Trim failed:", err);
        } finally {
            setTrimming(false);
        }
    }, [file, start, end, onConfirm]);

    return (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
                    <Scissors size={14} />
                    Audio is {fmt(duration)} — select a {maxDuration}s window
                </div>
                <button
                    onClick={onCancel}
                    className="text-zinc-500 transition-colors hover:text-zinc-300"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Waveform with region selector */}
            <div
                ref={waveformRef}
                className="w-full rounded-md bg-zinc-900/50"
            />

            {/* Time display */}
            <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                    Selection: <span className="font-mono text-sky-400">{fmt(start)}</span>
                    {" — "}
                    <span className="font-mono text-sky-400">{fmt(end)}</span>
                    {" "}
                    <span className="text-zinc-500">({Math.round(end - start)}s)</span>
                </span>
                <div className="flex items-center gap-1 text-zinc-500">
                    <GripVertical size={12} />
                    Drag edges or region to adjust
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={playPreview}
                    disabled={!ready}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
                >
                    Preview
                </button>
                <div className="flex-1" />
                <button
                    onClick={onCancel}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
                >
                    Cancel
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={trimming || !ready}
                    className="flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-40"
                >
                    <Check size={12} />
                    {trimming ? "Trimming…" : "Use Selection"}
                </button>
            </div>
        </div>
    );
}

/**
 * Encode an AudioBuffer to WAV format (PCM 16-bit).
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, "WAVE");

    // fmt sub-chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);

    // data sub-chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Interleave samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
