"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, BellOff } from "lucide-react";
import {
    getCollaborations,
    markCollaborationSeen,
    type CollaborationItem,
} from "@/lib/api/dashboard";

function timeAgo(iso: string | null): string {
    if (!iso) return "Never";
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

export default function CollaborationPanel() {
    const [items, setItems] = useState<CollaborationItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getCollaborations().then((res) => {
            if (res.success && res.data) setItems(res.data);
            setLoading(false);
        });
    }, []);

    const handleSeen = async (item: CollaborationItem) => {
        const [owner, repo] = item.repo_id.split("/");
        if (!owner || !repo) return;
        await markCollaborationSeen(owner, repo);
        setItems((prev) =>
            prev.map((i) =>
                i.repo_id === item.repo_id
                    ? { ...i, unread_count: 0, last_seen_at: new Date().toISOString() }
                    : i
            )
        );
    };

    if (!loading && items.length === 0) return null;

    const totalUnread = items.reduce((s, i) => s + i.unread_count, 0);

    return (
        <div className="glass-card rounded-xl p-6 animate-fade-in-up delay-400">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400 opacity-80" />
                    Collaborations
                </h3>
                {totalUnread > 0 && (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-300">
                        {totalUnread} new
                    </span>
                )}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 rounded-lg bg-zinc-800/40 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="space-y-1">
                    {items.map((item) => {
                        const [_owner] = item.repo_id.split("/");
                        return (
                            <div
                                key={item.repo_id}
                                className="group flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-800/40"
                            >
                                <Link
                                    href={`/repository/${item.repo_id}`}
                                    className="flex-1 min-w-0"
                                >
                                    <div className="flex items-center gap-1.5">
                                        {item.unread_count > 0 && (
                                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        )}
                                        <span className="text-sm font-medium text-zinc-200 group-hover:text-[#A7C7E7] transition-colors truncate">
                                            {item.repo_name}
                                        </span>
                                        {item.unread_count > 0 && (
                                            <span className="shrink-0 ml-auto text-xs font-semibold text-amber-400">
                                                +{item.unread_count}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-0.5">
                                        <Link
                                            href={`/profile/${item.owner_username}`}
                                            className="hover:text-zinc-300 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {item.owner_display_name}
                                        </Link>
                                        {item.last_push_at && (
                                            <> · {timeAgo(item.last_push_at)}</>
                                        )}
                                    </div>
                                </Link>

                                {/* Mark seen button */}
                                {item.unread_count > 0 && (
                                    <button
                                        onClick={() => handleSeen(item)}
                                        title="Mark as seen"
                                        className="shrink-0 p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <BellOff size={13} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
