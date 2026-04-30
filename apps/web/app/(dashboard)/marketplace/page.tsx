"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listCollabListings, type CollabListing } from "@/lib/api/marketplace";
import { Briefcase, Clock, DollarSign, Plus, Loader2 } from "lucide-react";

function formatCents(n: number, currency = "USD"): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
}

export default function MarketplacePage() {
    const [listings, setListings] = useState<CollabListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        const res = await listCollabListings("open", 30, 0);
        if (!res.success) setError(res.error);
        else setListings(res.data?.listings ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <header className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-semibold flex items-center gap-2">
                        <Briefcase className="w-7 h-7" /> Musician Marketplace
                    </h1>
                    <p className="text-zinc-400 mt-1 text-sm">
                        Post a project, hire a musician. Funds held in escrow until you approve delivery.
                    </p>
                </div>
                <Link
                    href="/marketplace/new"
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Post a project
                </Link>
            </header>

            {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading listings…
                </div>
            ) : listings.length === 0 ? (
                <div className="text-zinc-400 text-sm p-6 border border-zinc-800 rounded">
                    No open projects yet. Be the first to post one.
                </div>
            ) : (
                <ul className="space-y-3">
                    {listings.map((listing) => (
                        <li
                            key={listing.id}
                            className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition"
                        >
                            <Link href={`/marketplace/${listing.id}`} className="block">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <h2 className="font-medium">{listing.title}</h2>
                                        {listing.skills_wanted.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {listing.skills_wanted.map((s) => (
                                                    <span
                                                        key={s}
                                                        className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"
                                                    >
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="flex items-center gap-1 text-emerald-400 font-medium">
                                            <DollarSign className="w-4 h-4" />
                                            {formatCents(listing.budget_cents, listing.currency)}
                                        </div>
                                        {listing.deadline_at && (
                                            <div className="mt-1 flex items-center gap-1 justify-end text-xs text-zinc-500">
                                                <Clock className="w-3 h-3" />
                                                {new Date(listing.deadline_at).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
