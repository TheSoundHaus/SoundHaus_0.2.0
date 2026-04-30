"use client";

import Link from "next/link";
import { useState } from "react";
import {
    Waves,
    Monitor,
    Music,
    Copy,
    Check,
    ExternalLink,
    Download,
} from "lucide-react";
import type { RepoStats } from "@/lib/types/api";

function getRepositoryLink(owner: string, repo: string, cloneUrl?: string): string {
    const fallback = `https://git.thesound.haus/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    if (!cloneUrl) {
        return fallback;
    }

    try {
        const repoUrl = new URL(cloneUrl);
        repoUrl.username = "";
        repoUrl.password = "";
        repoUrl.pathname = repoUrl.pathname.replace(/\.git$/, "");
        return repoUrl.toString();
    } catch {
        return cloneUrl.replace(/\.git$/, "") || fallback;
    }
}

interface ClonePageClientProps {
    owner: string;
    repo: string;
    stats: RepoStats | null;
}

export default function ClonePageClient({
    owner,
    repo,
    stats,
}: ClonePageClientProps) {
    const [copied, setCopied] = useState(false);

    const repositoryLink = getRepositoryLink(owner, repo, stats?.clone_url);
    const desktopDeepLink = `soundhaus://clone/${owner}/${repo}`;
    const webLink = `/explore/${owner}/${repo}`;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(repositoryLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    };

    const description = stats?.description || "A SoundHaus project";
    const genres = stats?.genres?.map((g) => g.genre_name) ?? [];

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 overflow-x-hidden">
            {/* Grain overlay */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                }}
                aria-hidden
            />

            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-900/80 backdrop-blur-md border-b border-white/5">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-white hover:text-glass-blue-400 transition-colors no-underline"
                    >
                        <Waves className="w-6 h-6 text-glass-blue-400" />
                        <span className="text-xl font-bold tracking-tight">SoundHaus</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/signup"
                            className="btn btn-primary btn-sm !min-h-0 !py-2 !px-5 text-sm no-underline"
                        >
                            Sign Up
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 pt-28 pb-20 px-6">
                <div className="mx-auto max-w-lg">
                    {/* Clone Invitation Card */}
                    <div
                        className="rounded-2xl border border-white/10 bg-zinc-800/70 backdrop-blur-sm overflow-hidden"
                        style={{
                            boxShadow:
                                "0 0 80px rgba(167, 199, 231, 0.06), 0 25px 50px rgba(0,0,0,0.4)",
                        }}
                    >
                        {/* Header gradient band */}
                        <div className="h-2 bg-gradient-to-r from-glass-blue-400 via-violet-500 to-glass-blue-400" />

                        <div className="p-8">
                            {/* Badge */}
                            <div className="flex items-center gap-2 mb-6">
                                <div className="flex items-center gap-1.5 rounded-full bg-glass-blue-400/10 border border-glass-blue-400/20 px-3 py-1">
                                    <Download className="w-3.5 h-3.5 text-glass-blue-400" />
                                    <span className="text-xs font-medium text-glass-blue-400">Clone Invitation</span>
                                </div>
                            </div>

                            {/* Owner + repo */}
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-glass-blue-400 to-violet-500 flex items-center justify-center flex-shrink-0">
                                    <Music className="w-7 h-7 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-bold text-white truncate">
                                        {repo}
                                    </h1>
                                    <p className="text-sm text-zinc-400 mt-0.5">
                                        by{" "}
                                        <span className="text-glass-blue-400 font-medium">
                                            {owner}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-zinc-300 leading-relaxed mb-6">
                                {description}
                            </p>

                            {/* Genre tags */}
                            {genres.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {genres.map((g) => (
                                        <span
                                            key={g}
                                            className="rounded-full bg-glass-blue-400/10 border border-glass-blue-400/20 px-3 py-1 text-xs font-medium text-glass-blue-400"
                                        >
                                            {g}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Instructions */}
                            <div className="rounded-xl bg-zinc-900/70 border border-white/5 p-5 mb-6">
                                <h3 className="text-sm font-semibold text-white mb-3">How to clone this project</h3>
                                <ol className="space-y-2 text-sm text-zinc-400">
                                    <li className="flex gap-2">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-glass-blue-400/20 text-glass-blue-400 text-xs font-bold flex items-center justify-center">1</span>
                                        <span>Copy this repository link</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-glass-blue-400/20 text-glass-blue-400 text-xs font-bold flex items-center justify-center">2</span>
                                        <span>Open the SoundHaus Desktop app</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-glass-blue-400/20 text-glass-blue-400 text-xs font-bold flex items-center justify-center">3</span>
                                        <span>Copy this link and paste it into Clone Project in the SoundHaus Desktop app</span>
                                    </li>
                                </ol>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-3">
                                {/* Copy clone link */}
                                <button
                                    onClick={handleCopyLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-glass-blue-400 hover:bg-glass-blue-300 text-zinc-900 font-semibold py-3.5 px-6 transition-colors"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-5 h-5" />
                                            Link Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-5 h-5" />
                                            Copy Clone Link
                                        </>
                                    )}
                                </button>

                                {/* Open in Desktop (deep link) */}
                                <a
                                    href={desktopDeepLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-zinc-800/80 hover:bg-zinc-700/80 text-white font-medium py-3.5 px-6 transition-colors no-underline text-center"
                                >
                                    <Monitor className="w-5 h-5" />
                                    Open in SoundHaus Desktop
                                </a>

                                {/* View on Web */}
                                <Link
                                    href={webLink}
                                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/5 bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-white font-medium py-3 px-6 transition-colors no-underline text-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View Project Details
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* "Don't have the app?" nudge */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-zinc-500 mb-2">
                            Don&apos;t have the desktop app yet?
                        </p>
                        <a
                            href="/#download"
                            className="text-sm text-glass-blue-400 hover:text-glass-blue-300 transition-colors font-medium no-underline"
                        >
                            Download SoundHaus for free &rarr;
                        </a>
                    </div>
                </div>
            </main>

            {/* Minimal Footer */}
            <footer className="relative z-10 border-t border-white/5 py-8 px-6">
                <div className="mx-auto max-w-2xl flex items-center justify-between text-sm text-zinc-500">
                    <div className="flex items-center gap-2">
                        <Waves className="w-4 h-4 text-glass-blue-400" />
                        <span className="font-semibold text-white">SoundHaus</span>
                        <span>&copy; {new Date().getFullYear()}</span>
                    </div>
                    <Link
                        href="/signup"
                        className="hover:text-white transition-colors no-underline"
                    >
                        Create Account
                    </Link>
                </div>
            </footer>
        </div>
    );
}
