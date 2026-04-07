"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";

// ── Category display order & labels ────────────────────────────────────────

const CATEGORY_ORDER: KeyboardShortcut["category"][] = [
    "playback",
    "navigation",
    "timeline",
    "general",
];

const CATEGORY_LABELS: Record<KeyboardShortcut["category"], string> = {
    playback: "Playback",
    navigation: "Navigation",
    timeline: "Timeline",
    general: "General",
};

// ── Component ──────────────────────────────────────────────────────────────

interface KeyboardShortcutsModalProps {
    /** Whether the modal is visible. */
    open: boolean;
    /** Close callback. */
    onClose: () => void;
    /** All registered shortcuts to display. */
    shortcuts: KeyboardShortcut[];
}

export default function KeyboardShortcutsModal({
    open,
    onClose,
    shortcuts,
}: KeyboardShortcutsModalProps) {
    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    // Group shortcuts by category
    const grouped = new Map<KeyboardShortcut["category"], KeyboardShortcut[]>();
    for (const s of shortcuts) {
        const list = grouped.get(s.category) ?? [];
        list.push(s);
        grouped.set(s.category, list);
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
                aria-hidden
            />

            {/* Panel */}
            <div className="fixed inset-0 z-[4001] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 shadow-elevation-4 animate-scale-in"
                    role="dialog"
                    aria-modal
                    aria-label="Keyboard Shortcuts"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                        <h2 className="text-lg font-semibold text-white">
                            Keyboard Shortcuts
                        </h2>
                        <button
                            onClick={onClose}
                            className="rounded-md p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-thin">
                        {CATEGORY_ORDER.map((cat) => {
                            const items = grouped.get(cat);
                            if (!items?.length) return null;
                            return (
                                <div key={cat}>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                                        {CATEGORY_LABELS[cat]}
                                    </h3>
                                    <div className="space-y-2">
                                        {items.map((s) => (
                                            <div
                                                key={s.id}
                                                className="flex items-center justify-between"
                                            >
                                                <span className="text-sm text-zinc-300">
                                                    {s.label}
                                                </span>
                                                <kbd className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 text-xs font-mono font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-md">
                                                    {s.keys}
                                                </kbd>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer hint */}
                    <div className="border-t border-white/10 px-6 py-3">
                        <p className="text-xs text-zinc-500 text-center">
                            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded">?</kbd> anytime to toggle this modal
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
