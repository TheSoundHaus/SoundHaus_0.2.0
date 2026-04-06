"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Waves, Bell } from "lucide-react";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "./UserAvatar";
import { getPendingInvitations, acceptInvitation, declineInvitation } from "@/lib/api/invitations";
import { getDashboardData } from "@/lib/api/dashboard";
import type { Invitation } from "@/lib/types/api";
import type { DashboardActivity } from "@/lib/api/dashboard";

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

const activityDotColor: Record<string, string> = {
    push: "bg-green-500",
    create: "bg-blue-500",
    collaborate: "bg-amber-500",
};

// ── Component ────────────────────────────────────────────────────────────────

const Navbar = () => {
    const pathname = usePathname();
    const { user, loading } = useUser();
    const [scrolled, setScrolled] = useState(false);

    // Notification state
    const [isOpen, setIsOpen] = useState(false);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [activity, setActivity] = useState<DashboardActivity[]>([]);
    const [seenCount, setSeenCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Scroll listener
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Fetch notification data
    const fetchNotifications = useCallback(async () => {
        const [invResult, dashResult] = await Promise.all([
            getPendingInvitations(),
            getDashboardData(),
        ]);
        if (invResult.success && invResult.data) {
            setInvitations(invResult.data);
        }
        if (dashResult.success && dashResult.data?.activity) {
            setActivity(dashResult.data.activity.slice(0, 5));
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Close dropdown on outside click
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

    // Badge count
    const totalItems = invitations.length + activity.length;
    const unreadCount = Math.max(0, totalItems - seenCount);

    // Toggle dropdown and mark as seen
    const toggleDropdown = () => {
        if (!isOpen) {
            setSeenCount(totalItems);
        }
        setIsOpen((prev) => !prev);
    };

    // Invitation action handlers
    const handleAccept = async (id: number) => {
        await acceptInvitation(id);
        await fetchNotifications();
    };

    const handleDecline = async (id: number) => {
        await declineInvitation(id);
        await fetchNotifications();
    };

    const navLinks = [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/explore", label: "Explore" },
        { href: "/repositories", label: "Projects" },
    ];

    const isProfileActive = pathname === "/settings";

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
                            <div className="absolute right-0 top-full mt-2 w-80 z-50 glass-card rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 shadow-2xl shadow-black/40 overflow-hidden">
                                {/* Header */}
                                <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-zinc-100">Notifications</h3>
                                    <span className="text-xs text-zinc-500">{totalItems} total</span>
                                </div>

                                <div className="max-h-96 overflow-y-auto">
                                    {/* Invitations Section */}
                                    {invitations.length > 0 && (
                                        <div className="px-4 pt-3 pb-1">
                                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Invitations</p>
                                            <div className="space-y-2">
                                                {invitations.map((inv) => (
                                                    <div
                                                        key={inv.id}
                                                        className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 transition-all duration-200 hover:bg-white/[0.05]"
                                                    >
                                                        <p className="text-sm text-zinc-200 leading-snug">
                                                            <span className="font-medium text-zinc-100">{inv.owner_username}</span>
                                                            {" invited you to "}
                                                            <span className="font-medium text-glass-blue-400">{inv.repo_name}</span>
                                                        </p>
                                                        <div className="mt-1.5 flex items-center gap-2">
                                                            <span className="inline-flex items-center rounded-full bg-zinc-700/60 px-2 py-0.5 text-[10px] font-medium text-zinc-300 uppercase tracking-wide">
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

                                    {/* Activity Section */}
                                    {activity.length > 0 && (
                                        <div className="px-4 pt-3 pb-1">
                                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Activity</p>
                                            <div className="space-y-1">
                                                {activity.map((item, i) => (
                                                    <Link
                                                        key={`${item.repoOwner}-${item.repoName}-${i}`}
                                                        href={`/explore/${item.repoOwner}/${item.repoName}`}
                                                        className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-all duration-200 hover:bg-white/[0.04] cursor-pointer"
                                                    >
                                                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityDotColor[item.type] || "bg-zinc-500"}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm text-zinc-300 leading-snug truncate">{item.description}</p>
                                                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                                                                <span className="text-glass-blue-400 font-medium truncate">{item.repoName}</span>
                                                                <span>{timeAgo(item.time)}</span>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Empty State */}
                                    {invitations.length === 0 && activity.length === 0 && (
                                        <div className="px-4 py-8 text-center">
                                            <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                            <p className="text-sm text-zinc-500">You're all caught up</p>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom padding */}
                                <div className="h-2" />
                            </div>
                        )}
                    </div>

                    <Link
                        href="/settings"
                        className={`group relative ml-3 rounded-full p-1 transition-all duration-300 ${
                            isProfileActive
                                ? "ring-2 ring-glass-blue-400"
                                : "hover:ring-2 hover:ring-zinc-600"
                        }`}
                        title="Profile"
                    >
                        {loading ? (
                            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-700" />
                        ) : (
                            <UserAvatar
                                src={user?.avatar_url}
                                alt={user?.display_name || user?.username || "Profile"}
                                size={32}
                            />
                        )}
                        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-md bg-zinc-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
                            Profile
                        </span>
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
