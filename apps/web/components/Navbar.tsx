"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Waves, LogOut, Settings, User } from "lucide-react";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "./UserAvatar";
import { getPendingInvitations, acceptInvitation, declineInvitation } from "@/lib/api/invitations";
import type { Invitation } from "@/lib/types/api";
import { logout } from "@/actions/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

const Navbar = () => {
    const pathname = usePathname();
    const { user, loading } = useUser();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Notification state
    const [isOpen, setIsOpen] = useState(false);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [seenCount, setSeenCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Profile dropdown state
    const [profileOpen, setProfileOpen] = useState(false);
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    // Fetch notification data (Supabase only — no Gitea calls)
    const fetchNotifications = useCallback(async () => {
        const invResult = await getPendingInvitations();
        if (invResult.success && invResult.data) {
            setInvitations(invResult.data);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Close notification dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Close profile dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        }
        if (profileOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [profileOpen]);

    // Badge count
    const unreadCount = Math.max(0, invitations.length - seenCount);

    // Toggle dropdown and mark as seen
    const toggleDropdown = () => {
        if (!isOpen) {
            setSeenCount(invitations.length);
        }
        setIsOpen((prev) => !prev);
    };

    // Invitation action handlers
    const handleAccept = async (id: string) => {
        await acceptInvitation(id);
        await fetchNotifications();
    };

    const handleDecline = async (id: string) => {
        await declineInvitation(id);
        await fetchNotifications();
    };

    const navLinks = [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/explore", label: "Explore" },
        { href: "/repositories", label: "Projects" },
    ];

    return (
        <nav className={`sticky top-0 z-40 border-b px-6 py-4 transition-all duration-300 ${
            scrolled
                ? "bg-zinc-900/95 backdrop-blur-md border-zinc-700/50 shadow-lg shadow-black/20"
                : "bg-zinc-900 border-zinc-800"
        }`}>
            <div className="mx-auto flex max-w-7xl items-center justify-between">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-2xl font-bold tracking-tight hover:text-glass-blue-400 transition-colors duration-300 group"
                    style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.3)'}}
                >
                    <Waves className="w-6 h-6 text-glass-blue-400 transition-transform duration-300 group-hover:scale-110" />
                    SoundHaus
                </Link>
                <div className="flex items-center gap-1">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`relative rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                                    isActive
                                        ? "text-glass-blue-400"
                                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                                }`}
                            >
                                {link.label}
                                {isActive && (
                                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-glass-blue-400" />
                                )}
                            </Link>
                        );
                    })}

                    {/* Notification Bell */}
                    <div className="relative ml-2" ref={dropdownRef}>
                        <button
                            onClick={toggleDropdown}
                            className="relative rounded-md p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all duration-200 cursor-pointer"
                            aria-label="Notifications"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        {isOpen && (
                            <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 shadow-2xl shadow-black/40 overflow-hidden">
                                <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-zinc-100">Notifications</h3>
                                    <span className="text-xs text-zinc-500">{invitations.length} total</span>
                                </div>

                                <div className="max-h-96 overflow-y-auto">
                                    {invitations.length > 0 && (
                                        <div className="px-4 pt-3 pb-1">
                                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Invitations</p>
                                            <div className="space-y-2">
                                                {invitations.map((inv) => (
                                                    <div
                                                        key={inv.id}
                                                        className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 transition-colors duration-200 hover:bg-zinc-800/80"
                                                    >
                                                        <p className="text-sm text-zinc-200 leading-snug">
                                                            <span className="font-medium text-zinc-100">{inv.owner_username}</span>
                                                            {" invited you to "}
                                                            <span className="font-medium text-glass-blue-400">{inv.repo_name}</span>
                                                        </p>
                                                        <div className="mt-1.5 flex items-center gap-2">
                                                            <span className="inline-flex items-center rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 uppercase tracking-wide">
                                                                {inv.permission}
                                                            </span>
                                                            <span className="text-[11px] text-zinc-500">{timeAgo(inv.created_at)}</span>
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleAccept(inv.id)}
                                                                className="rounded-md bg-green-600/20 border border-green-500/30 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 transition-all duration-200 cursor-pointer"
                                                            >
                                                                Accept
                                                            </button>
                                                            <button
                                                                onClick={() => handleDecline(inv.id)}
                                                                className="rounded-md bg-red-600/20 border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-600/30 transition-all duration-200 cursor-pointer"
                                                            >
                                                                Decline
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {invitations.length === 0 && (
                                        <div className="px-4 py-8 text-center">
                                            <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                            <p className="text-sm text-zinc-500">You&apos;re all caught up</p>
                                        </div>
                                    )}
                                </div>

                                <div className="h-2" />
                            </div>
                        )}
                    </div>

                    {/* Profile avatar dropdown */}
                    <div className="relative ml-3" ref={profileDropdownRef}>
                        <button
                            onClick={() => setProfileOpen((prev) => !prev)}
                            className={`rounded-full p-1 transition-all duration-300 cursor-pointer ${
                                profileOpen
                                    ? "ring-2 ring-glass-blue-400"
                                    : "hover:ring-2 hover:ring-zinc-600"
                            }`}
                        >
                            {loading ? (
                                <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-700" />
                            ) : (
                                <UserAvatar
                                    src={user?.avatar_url}
                                    alt={user?.username || "Profile"}
                                    name={user?.username}
                                    size={32}
                                />
                            )}
                        </button>

                        {profileOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 z-50 rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 shadow-2xl shadow-black/40 overflow-hidden">
                                <div className="px-4 py-3 border-b border-zinc-700/50">
                                    <p className="text-sm font-medium text-zinc-100 truncate">{user?.username || "User"}</p>
                                    <p className="text-xs text-zinc-500 truncate">{user?.email || ""}</p>
                                </div>
                                <div className="py-1">
                                    <Link
                                        href={`/profile/${user?.username || ""}`}
                                        onClick={() => setProfileOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                                    >
                                        <User size={15} className="text-zinc-400" />
                                        Profile
                                    </Link>
                                    <Link
                                        href="/settings"
                                        onClick={() => setProfileOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                                    >
                                        <Settings size={15} className="text-zinc-400" />
                                        Settings
                                    </Link>
                                </div>
                                <div className="border-t border-zinc-700/50 py-1">
                                    <button
                                        onClick={() => {
                                            setProfileOpen(false);
                                            logout();
                                        }}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors cursor-pointer"
                                    >
                                        <LogOut size={15} />
                                        Log Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
