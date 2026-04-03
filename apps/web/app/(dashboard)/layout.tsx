"use client";

import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { UserProvider } from "@/lib/context/UserContext";
import AmbientWaveform from "@/components/AmbientWaveform";
import {
    useKeyboardShortcuts,
    createDefaultShortcuts,
} from "@/hooks/useKeyboardShortcuts";

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
            <div className="min-h-screen bg-[#111318] text-zinc-100">
                <AmbientWaveform />
                {/* Frost layer — softly blurs the waveform before glass cards add their own blur */}
                <div
                    className="fixed inset-0 z-[5] pointer-events-none"
                    style={{
                        backdropFilter: 'blur(32px)',
                        WebkitBackdropFilter: 'blur(32px)',
                        background: 'rgba(15, 20, 28, 0.45)',
                    }}
                    aria-hidden="true"
                />
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
