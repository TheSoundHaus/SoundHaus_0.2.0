"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Waves } from "lucide-react";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "./UserAvatar";

const Navbar = () => {
    const pathname = usePathname();
    const { user, loading } = useUser();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

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
