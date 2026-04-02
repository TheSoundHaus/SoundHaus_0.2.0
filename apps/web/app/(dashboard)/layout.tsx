"use client";

import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { UserProvider } from "@/lib/context/UserContext";
import CursorGlow from "@/components/CursorGlow";
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
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                <CursorGlow />
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
