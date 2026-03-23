"use client";

import { useEffect, useRef } from "react";

// ── Shortcut definitions ───────────────────────────────────────────────────

export interface KeyboardShortcut {
    /** Unique identifier for the shortcut. */
    id: string;
    /** Human-readable key combo, e.g. "Space", "Ctrl+Z". */
    keys: string;
    /** Short description displayed in the shortcuts modal. */
    label: string;
    /** Category for grouping in the modal. */
    category: "playback" | "navigation" | "timeline" | "general";
    /** The handler to invoke when the shortcut fires. */
    handler: () => void;
}

// ── Default shortcut registry ──────────────────────────────────────────────

/**
 * Creates the default set of keyboard shortcuts.
 *
 * Callers supply optional handler overrides — any handler not supplied
 * becomes a no-op so the shortcut is still listed in the modal.
 */
export function createDefaultShortcuts(handlers: {
    togglePlay?: () => void;
    prevCommit?: () => void;
    nextCommit?: () => void;
    scrollTrackUp?: () => void;
    scrollTrackDown?: () => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    showHelp?: () => void;
}): KeyboardShortcut[] {
    const noop = () => {};
    return [
        {
            id: "play-pause",
            keys: "Space",
            label: "Play / Pause audio",
            category: "playback",
            handler: handlers.togglePlay ?? noop,
        },
        {
            id: "prev-commit",
            keys: "←",
            label: "Previous commit",
            category: "navigation",
            handler: handlers.prevCommit ?? noop,
        },
        {
            id: "next-commit",
            keys: "→",
            label: "Next commit",
            category: "navigation",
            handler: handlers.nextCommit ?? noop,
        },
        {
            id: "scroll-track-up",
            keys: "J",
            label: "Scroll to previous track",
            category: "timeline",
            handler: handlers.scrollTrackUp ?? noop,
        },
        {
            id: "scroll-track-down",
            keys: "K",
            label: "Scroll to next track",
            category: "timeline",
            handler: handlers.scrollTrackDown ?? noop,
        },
        {
            id: "zoom-in",
            keys: "+",
            label: "Zoom in on timeline",
            category: "timeline",
            handler: handlers.zoomIn ?? noop,
        },
        {
            id: "zoom-out",
            keys: "−",
            label: "Zoom out on timeline",
            category: "timeline",
            handler: handlers.zoomOut ?? noop,
        },
        {
            id: "show-help",
            keys: "?",
            label: "Show keyboard shortcuts",
            category: "general",
            handler: handlers.showHelp ?? noop,
        },
    ];
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Global keyboard shortcut listener.
 *
 * Attaches a single `keydown` handler to `document` and dispatches to
 * matching shortcuts. Ignores events when the user is typing in an
 * input, textarea, or content-editable element.
 *
 * @param shortcuts — array of {@link KeyboardShortcut} definitions
 * @param enabled  — master toggle (default `true`)
 */
export function useKeyboardShortcuts(
    shortcuts: KeyboardShortcut[],
    enabled = true,
) {
    // Keep handlers in a ref so the effect doesn't re-bind on every render.
    const shortcutsRef = useRef(shortcuts);
    shortcutsRef.current = shortcuts;

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore when focus is inside an editable field
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if ((e.target as HTMLElement)?.isContentEditable) return;

            for (const shortcut of shortcutsRef.current) {
                if (matchesShortcut(e, shortcut.keys)) {
                    e.preventDefault();
                    shortcut.handler();
                    return;
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [enabled]);
}

// ── Key matching helper ────────────────────────────────────────────────────

function matchesShortcut(e: KeyboardEvent, keys: string): boolean {
    const k = keys.toLowerCase().trim();

    switch (k) {
        case "space":
            return e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey;
        case "←":
        case "arrowleft":
            return e.key === "ArrowLeft" && !e.ctrlKey && !e.metaKey;
        case "→":
        case "arrowright":
            return e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey;
        case "j":
            return e.key.toLowerCase() === "j" && !e.ctrlKey && !e.metaKey;
        case "k":
            return e.key.toLowerCase() === "k" && !e.ctrlKey && !e.metaKey;
        case "+":
        case "=":
            return (e.key === "+" || e.key === "=") && !e.ctrlKey && !e.metaKey;
        case "−":
        case "-":
            return e.key === "-" && !e.ctrlKey && !e.metaKey;
        case "?":
            return e.key === "?" && !e.ctrlKey && !e.metaKey;
        default:
            return e.key.toLowerCase() === k;
    }
}
