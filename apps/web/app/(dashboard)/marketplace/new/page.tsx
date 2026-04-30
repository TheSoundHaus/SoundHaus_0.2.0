"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCollabListing } from "@/lib/api/marketplace";
import { Briefcase, Loader2 } from "lucide-react";

export default function NewListingPage() {
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [budget, setBudget] = useState("");
    const [skills, setSkills] = useState("");
    const [deadline, setDeadline] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const cents = Math.round(parseFloat(budget) * 100);
        if (!Number.isFinite(cents) || cents < 100) {
            setError("Budget must be at least $1.00");
            return;
        }
        startTransition(async () => {
            const res = await createCollabListing({
                title: title.trim(),
                description_md: description.trim(),
                budget_cents: cents,
                skills_wanted: skills
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
            });
            if (!res.success) {
                setError(res.error);
                return;
            }
            router.push(`/marketplace/${res.data?.listing_id}`);
        });
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Briefcase className="w-6 h-6" /> Post a project
            </h1>
            {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                    <span className="text-sm text-zinc-300">Title</span>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        maxLength={200}
                        className="mt-1 w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none"
                        placeholder="Mix my 8-track indie song"
                    />
                </label>

                <label className="block">
                    <span className="text-sm text-zinc-300">Description (Markdown supported)</span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        rows={6}
                        className="mt-1 w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none font-mono text-sm"
                        placeholder="What you want, references, reference tracks, turn-around…"
                    />
                </label>

                <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                        <span className="text-sm text-zinc-300">Budget (USD)</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            required
                            className="mt-1 w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none"
                            placeholder="250"
                        />
                    </label>
                    <label className="block">
                        <span className="text-sm text-zinc-300">Deadline (optional)</span>
                        <input
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="mt-1 w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none"
                        />
                    </label>
                </div>

                <label className="block">
                    <span className="text-sm text-zinc-300">Skills wanted (comma-separated)</span>
                    <input
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none"
                        placeholder="mixing, vocal tuning, mastering"
                    />
                </label>

                <button
                    type="submit"
                    disabled={isPending}
                    className="w-full px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Posting…
                        </>
                    ) : (
                        "Post project"
                    )}
                </button>
            </form>
        </div>
    );
}
