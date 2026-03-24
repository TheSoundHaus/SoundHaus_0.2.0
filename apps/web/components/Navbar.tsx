"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navbar Component - Global navigation for authenticated pages
 * Used in dashboard layout to provide consistent navigation
 * Highlights the currently active page
 */
const Navbar = () => {
    const pathname = usePathname();

    const navLinks = [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/explore", label: "Explore" },
        { href: "/repositories", label: "Repositories" },
        { href: "/settings", label: "Settings" },
    ];

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
                <div className="flex gap-4">
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
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
