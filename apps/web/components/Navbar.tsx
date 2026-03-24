"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "./UserAvatar";

/**
 * Navbar Component - Global navigation for authenticated pages
 * Used in dashboard layout to provide consistent navigation
 * Highlights the currently active page
 * Shows user avatar in place of the Profile text link
 */
const Navbar = () => {
    const pathname = usePathname();
    const { user, loading } = useUser();

    const navLinks = [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/explore", label: "Explore" },
        { href: "/repositories", label: "Projects" },
    ];

    const isProfileActive = pathname === "/settings";

    return (
        <nav className="border-b border-zinc-800 px-6 py-4 bg-zinc-900">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
                <Link
                    href="/dashboard"
                    className="text-2xl font-bold tracking-tight hover:text-glass-blue-400 transition-colors duration-300"
                    style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.3)'}}
                >
                    SoundHaus
                </Link>
                <div className="flex items-center gap-4">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                                    isActive
                                        ? "bg-zinc-800 text-glass-blue-400"
                                        : "text-zinc-300 hover:bg-zinc-800 hover:text-glass-blue-400"
                                }`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                    {/* Profile avatar link */}
                    <Link
                        href="/settings"
                        className={`group relative rounded-full p-1 transition-all duration-300 ${
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
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
                            Profile
                        </span>
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
