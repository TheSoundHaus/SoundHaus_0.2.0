"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
    createCheckoutSession,
    getStorageUsage,
    getSubscription,
    openCustomerPortal,
    type StorageUsageInfo,
    type SubscriptionStatus,
    type Tier,
} from "@/lib/api/billing";
import { Check, CreditCard, HardDrive, Loader2, Sparkles } from "lucide-react";

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const TIER_FEATURES: Record<Tier, string[]> = {
    free: ["1 GB storage", "1 private repo", "Public repos unlimited"],
    pro: ["25 GB storage", "25 private repos", "Marketplace payouts", "Priority support"],
    team: ["200 GB storage", "500 private repos", "Classroom (100 seats)", "LTI / Canvas integration"],
};

export default function BillingPage() {
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
    const [usage, setUsage] = useState<StorageUsageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        const [subRes, usageRes] = await Promise.all([getSubscription(), getStorageUsage()]);
        if (!subRes.success) setError(subRes.error);
        else setSubscription(subRes.data);
        if (usageRes.success) setUsage(usageRes.data);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const handleUpgrade = (tier: "pro" | "team") => {
        startTransition(async () => {
            const res = await createCheckoutSession(tier);
            if (res.success && res.data?.url) {
                window.location.href = res.data.url;
            } else if (!res.success) {
                setError(res.error);
            }
        });
    };

    const handlePortal = () => {
        startTransition(async () => {
            const res = await openCustomerPortal();
            if (res.success && res.data?.url) {
                window.location.href = res.data.url;
            } else if (!res.success) {
                setError(res.error);
            }
        });
    };

    const currentTier: Tier = subscription?.tier ?? "free";
    const isPaid = currentTier !== "free" && subscription?.status === "active";
    const pct = usage ? Math.min(100, Math.round((usage.bytes_used / Math.max(usage.quota_bytes, 1)) * 100)) : 0;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-semibold flex items-center gap-2">
                    <CreditCard className="w-7 h-7" /> Billing & Plan
                </h1>
                <p className="text-zinc-400 mt-1">
                    Manage your subscription and review storage usage.
                </p>
            </header>

            {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
            ) : (
                <>
                    <section className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/40">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-zinc-400">Current plan</div>
                                <div className="text-2xl font-semibold capitalize flex items-center gap-2">
                                    {currentTier}
                                    {isPaid && <Sparkles className="w-5 h-5 text-amber-400" />}
                                </div>
                                <div className="text-sm text-zinc-400 mt-1">
                                    Status: <span className="text-zinc-200">{subscription?.status ?? "inactive"}</span>
                                    {subscription?.current_period_end && (
                                        <> · Renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
                                    )}
                                </div>
                            </div>
                            {isPaid && (
                                <button
                                    onClick={handlePortal}
                                    disabled={isPending}
                                    className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
                                >
                                    Manage subscription
                                </button>
                            )}
                        </div>
                    </section>

                    {usage && (
                        <section className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/40">
                            <div className="flex items-center gap-2 text-sm text-zinc-300">
                                <HardDrive className="w-4 h-4" /> Storage
                            </div>
                            <div className="mt-2 h-2 bg-zinc-800 rounded overflow-hidden">
                                <div
                                    className={`h-full ${pct > 90 ? "bg-red-500" : "bg-indigo-500"}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="mt-2 text-xs text-zinc-400">
                                {formatBytes(usage.bytes_used)} / {formatBytes(usage.quota_bytes)} ({pct}%)
                            </div>
                        </section>
                    )}

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(["free", "pro", "team"] as const).map((tier) => {
                            const isCurrent = tier === currentTier;
                            return (
                                <div
                                    key={tier}
                                    className={`p-5 rounded-lg border ${isCurrent ? "border-indigo-500" : "border-zinc-800"} bg-zinc-900/40 flex flex-col`}
                                >
                                    <div className="text-lg font-semibold capitalize">{tier}</div>
                                    <ul className="mt-3 space-y-1 text-sm text-zinc-300 flex-1">
                                        {TIER_FEATURES[tier].map((f) => (
                                            <li key={f} className="flex items-start gap-2">
                                                <Check className="w-4 h-4 text-emerald-400 mt-0.5" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {tier !== "free" && !isCurrent && (
                                        <button
                                            onClick={() => handleUpgrade(tier)}
                                            disabled={isPending}
                                            className="mt-4 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm disabled:opacity-50"
                                        >
                                            {isPending ? "Redirecting…" : `Upgrade to ${tier}`}
                                        </button>
                                    )}
                                    {isCurrent && (
                                        <div className="mt-4 text-xs text-indigo-300">Your current plan</div>
                                    )}
                                </div>
                            );
                        })}
                    </section>
                </>
            )}
        </div>
    );
}
