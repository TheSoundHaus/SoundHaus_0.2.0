"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Upload, X, Music, Loader2, Trash2, CheckCircle } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import { uploadSnippetAction, deleteSnippetAction } from "@/actions/snippets";
import type { SnippetMetadata } from "@/lib/types/api";

/** Allowed MIME types that the backend accepts */
const ALLOWED_TYPES = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/aiff",
    "audio/x-aiff",
    "audio/ogg",
    "audio/mp4",
]);

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".flac", ".aiff", ".aif", ".ogg", ".m4a"];

/** Max snippet duration in seconds — files longer than this are rejected with a message.
 *  30s keeps AI stem-separation (Demucs) fast and responsive. */
const MAX_DURATION_SECONDS = 30;

/** 10 MB — matches backend MAX_AUDIO_SNIPPET_SIZE */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface SnippetUploaderProps {
    owner: string;
    repo: string;
    /** Currently stored snippet URL (null if none) */
    existingUrl: string | null;
    /** Currently stored metadata */
    existingMetadata: SnippetMetadata | null;
    /** Called after successful upload or delete so parent can refresh.
     *  Receives the new snippet URL on upload, or null on delete. */
    onUpdate?: (newUrl: string | null) => void;
    /** Optional content rendered between the snippet display and the drop zone */
    middleContent?: React.ReactNode;
}

/**
 * SnippetUploader — drag-and-drop audio upload for repo settings.
 *
 * Features:
 * - Drag & drop or click-to-browse for audio files
 * - Client-side validation (type, size, duration)
 * - Shows existing snippet with playback + delete option
 * - Upload progress indication
 */
export default function SnippetUploader({
    owner,
    repo,
    existingUrl,
    existingMetadata,
    onUpdate,
    middleContent,
}: SnippetUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isPending, startTransition] = useTransition();
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Local state to track current snippet without full page refresh
    const [snippetUrl, setSnippetUrl] = useState(existingUrl);
    const [snippetMeta, setSnippetMeta] = useState(existingMetadata);

    // ── Helpers ─────────────────────────────────────────────────────

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /** Use an Audio element to read the duration of a File in the browser. */
    async function getAudioDuration(file: File): Promise<number> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio();
            audio.preload = "metadata";
            audio.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                resolve(audio.duration);
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read audio metadata"));
            };
            audio.src = url;
        });
    }

    /** Validate a file client-side before uploading. */
    async function validateFile(
        file: File,
    ): Promise<string | null> {
        // Extension check
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return `Unsupported format "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
        }

        // MIME check (some browsers report empty, so only check if present)
        if (file.type && !ALLOWED_TYPES.has(file.type)) {
            return `Invalid file type "${file.type}". Must be an audio file.`;
        }

        // Size check
        if (file.size > MAX_FILE_SIZE) {
            return `File is ${formatBytes(file.size)} — max allowed is ${formatBytes(MAX_FILE_SIZE)}.`;
        }

        if (file.size === 0) {
            return "File is empty.";
        }

        // Duration check
        try {
            const duration = await getAudioDuration(file);
            if (duration > MAX_DURATION_SECONDS) {
                return `Audio is ${Math.round(duration)}s long — max allowed is ${MAX_DURATION_SECONDS}s for AI stem separation. Please trim or upload a shorter clip.`;
            }
        } catch {
            // Some audio formats (e.g. certain .ogg containers) don't expose
            // duration via the browser's Audio element. Rather than blocking
            // the upload we skip the client-side check and let the backend
            // enforce the duration limit (it returns a clear 400 error).
            console.warn(`Could not read duration for "${file.name}" — skipping client-side duration check.`);
        }

        return null; // valid
    }

    // ── Upload handler ──────────────────────────────────────────────

    const handleFile = useCallback(
        (file: File) => {
            setError(null);
            setSuccessMsg(null);

            startTransition(async () => {
                // Client-side validation
                const validationError = await validateFile(file);
                if (validationError) {
                    setError(validationError);
                    return;
                }

                // Build FormData for the server action
                const fd = new FormData();
                fd.append("file", file);

                const result = await uploadSnippetAction(owner, repo, fd);

                if (!result.success) {
                    setError(result.error);
                    return;
                }

                setSnippetUrl(result.url);
                setSnippetMeta(result.metadata);
                setSuccessMsg("Snippet uploaded successfully!");
                onUpdate?.(result.url ?? null);
            });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [owner, repo, onUpdate],
    );

    // ── Delete handler ──────────────────────────────────────────────

    const handleDelete = useCallback(() => {
        if (!confirm("Remove the audio snippet from this project?")) return;
        setError(null);
        setSuccessMsg(null);

        startTransition(async () => {
            const result = await deleteSnippetAction(owner, repo);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setSnippetUrl(null);
            setSnippetMeta(null);
            setSuccessMsg("Snippet removed.");
            onUpdate?.(null);
        });
    }, [owner, repo, onUpdate]);

    // ── Drag & drop handlers ────────────────────────────────────────

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);

            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const onInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset the input so the same file can be re-selected
            e.target.value = "";
        },
        [handleFile],
    );

    // ── Render ──────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            <label className="mb-1 block text-sm font-medium">Audio Snippet</label>
            <p className="text-xs text-zinc-400">
                Upload a short audio preview for your project (max {MAX_DURATION_SECONDS}s, up to{" "}
                {formatBytes(MAX_FILE_SIZE)}).
            </p>
            <p className="text-xs text-amber-400/80">
                Snippets are limited to {MAX_DURATION_SECONDS}s for AI stem separation.
                Longer files will be automatically trimmed.
            </p>

            {/* Existing snippet player + delete */}
            {snippetUrl && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                            <Music size={14} /> Current Snippet
                            {snippetMeta?.format && (
                                <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                                    {snippetMeta.format.toUpperCase()}
                                </span>
                            )}
                            {snippetMeta?.duration != null && (
                                <span className="text-xs text-zinc-400">
                                    {Math.round(snippetMeta.duration)}s
                                </span>
                            )}
                            {snippetMeta?.file_size != null && (
                                <span className="text-xs text-zinc-400">
                                    {formatBytes(snippetMeta.file_size)}
                                </span>
                            )}
                        </span>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isPending}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                            <Trash2 size={12} /> Remove
                        </button>
                    </div>
                    <AudioPlayer src={snippetUrl} />
                </div>
            )}

            {/* Middle content slot (e.g. StemPlayer) */}
            {middleContent}

            {/* Drop zone */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${
                    dragOver
                        ? "border-glass-cyan-500 bg-glass-cyan-500/5"
                        : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/40"
                } ${isPending ? "pointer-events-none opacity-60" : ""}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS.join(",")}
                    onChange={onInputChange}
                    className="hidden"
                />

                {isPending ? (
                    <>
                        <Loader2 size={32} className="mb-3 animate-spin text-zinc-400" />
                        <p className="text-sm font-medium text-zinc-300">Uploading…</p>
                    </>
                ) : (
                    <>
                        <Upload size={32} className="mb-3 text-zinc-500" />
                        <p className="text-sm font-medium text-zinc-300">
                            {snippetUrl ? "Replace snippet" : "Drop audio file here"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                            or click to browse — {ALLOWED_EXTENSIONS.join(", ")}
                        </p>
                    </>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    <X size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Success */}
            {successMsg && !error && (
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                    <CheckCircle size={16} className="shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}
        </div>
    );
}
