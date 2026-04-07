"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Music, ChevronLeft, ChevronRight } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import UserAvatar from "@/components/UserAvatar";
import { getSnippetFeed, type SnippetFeedItem } from "@/lib/api/dashboard";

function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

function SnippetCard({ item }: { item: SnippetFeedItem }) {
    const ownerSlug = item.owner_username || item.owner_id;
    const [owner, repoName] = item.repo_id.split("/");

    return (
        <div className="glass-card rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:border-[#A7C7E7]/30 hover:shadow-[0_0_16px_rgba(167,199,231,0.08)]">
            {/* Thumbnail */}
            {item.thumbnail_url && item.thumbnail_type === "image" ? (
                <Link href={`/explore/${owner}/${repoName}`} className="block h-32 overflow-hidden">
                    <img
                        src={item.thumbnail_url}
                        alt={item.repo_name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                </Link>
            ) : (
                <div className="h-24 bg-zinc-900/60 flex items-center justify-center">
                    <Music className="w-8 h-8 text-zinc-700" />
                </div>
            )}

            <div className="p-4 flex flex-col gap-2 flex-1">
                {/* Title */}
                <Link
                    href={`/explore/${owner}/${repoName}`}
                    className="text-sm font-semibold text-zinc-100 hover:text-[#A7C7E7] transition-colors line-clamp-1"
                >
                    {item.repo_name}
                </Link>

                {/* Owner */}
                <Link
                    href={`/profile/${ownerSlug}`}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
                >
                    <UserAvatar src={item.owner_avatar_url} alt={item.owner_display_name} size={14} />
                    <span>{item.owner_display_name}</span>
                    {item.last_activity_at && (
                        <span className="text-zinc-600">&middot; {timeAgo(item.last_activity_at)}</span>
                    )}
                </Link>

                {/* Genres */}
                {item.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {item.genres.slice(0, 3).map((g) => (
                            <span
                                key={g}
                                className="text-[10px] text-[#A7C7E7] bg-zinc-800/60 rounded-full px-2 py-0.5 border border-zinc-700/50"
                            >
                                {g}
                            </span>
                        ))}
                    </div>
                )}

                {/* Audio Player */}
                <div className="mt-auto pt-2">
                    <AudioPlayer src={item.audio_snippet} compact />
                </div>
            </div>
        </div>
    );
}

export default function SnippetFeed() {
    const [items, setItems] = useState<SnippetFeedItem[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getSnippetFeed(page).then((res) => {
            if (res.success && res.data) {
                setItems(res.data.snippets);
                setPages(res.data.pages);
            }
            setLoading(false);
        });
    }, [page]);

    if (!loading && items.length === 0) return null;

    return (
        <div className="glass-card rounded-xl p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Music className="w-4 h-4 text-[#A7C7E7] opacity-70" />
                    Discover Snippets
                </h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-zinc-500">{page}/{pages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={page >= pages}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-52 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map((item) => (
                        <SnippetCard key={item.repo_id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}
