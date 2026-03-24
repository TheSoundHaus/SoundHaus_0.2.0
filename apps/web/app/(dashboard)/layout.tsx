"use client";

import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { UserProvider } from "@/lib/context/UserContext";
import {
    useKeyboardShortcuts,
    createDefaultShortcuts,
} from "@/hooks/useKeyboardShortcuts";

/**
 * Dashboard Layout - Wrapper for all authenticated dashboard pages
 * Provides consistent navigation via Navbar, user profile context,
 * and global keyboard shortcuts.
 */
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
            <div className="min-h-screen bg-zinc-900 text-zinc-100">
                <Navbar />
                <main>{children}</main>
                <KeyboardShortcutsModal
                    open={shortcutsOpen}
                    onClose={() => setShortcutsOpen(false)}
                    shortcuts={shortcuts}
                />
            </div>
        </UserProvider>
    );
}