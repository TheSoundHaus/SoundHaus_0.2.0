"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
    createClassroom,
    joinClassroom,
    listMyClassrooms,
    type Classroom,
} from "@/lib/api/classroom";
import { GraduationCap, Plus, Users, Loader2 } from "lucide-react";

export default function ClassroomHome() {
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [joinCode, setJoinCode] = useState("");
    const [newName, setNewName] = useState("");
    const [isPending, startTransition] = useTransition();

    const reload = useCallback(async () => {
        setLoading(true);
        const res = await listMyClassrooms();
        if (!res.success) setError(res.error);
        else setClassrooms(res.data?.classrooms ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await createClassroom({ name: newName.trim() });
            if (!res.success) {
                setError(res.error);
                return;
            }
            setNewName("");
            await reload();
        });
    };

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await joinClassroom(joinCode.trim());
            if (!res.success) {
                setError(res.error);
                return;
            }
            setJoinCode("");
            await reload();
        });
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <header>
                <h1 className="text-3xl font-semibold flex items-center gap-2">
                    <GraduationCap className="w-7 h-7" /> Classroom
                </h1>
                <p className="text-zinc-400 mt-1 text-sm">
                    Create a classroom for your students, or join an existing one by code.
                </p>
            </header>

            {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
            )}

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <form onSubmit={handleCreate} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-3">
                    <h2 className="text-sm font-medium flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Create classroom
                    </h2>
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Intro to Ableton Live"
                        required
                        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none"
                    />
                    <button
                        type="submit"
                        disabled={isPending}
                        className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm disabled:opacity-50"
                    >
                        Create
                    </button>
                </form>

                <form onSubmit={handleJoin} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-3">
                    <h2 className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4" /> Join with code
                    </h2>
                    <input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABCD1234"
                        required
                        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-indigo-500 outline-none font-mono"
                    />
                    <button
                        type="submit"
                        disabled={isPending}
                        className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50"
                    >
                        Join
                    </button>
                </form>
            </section>

            <section>
                <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-2">Your classrooms</h2>
                {loading ? (
                    <div className="flex items-center gap-2 text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : classrooms.length === 0 ? (
                    <div className="text-zinc-500 text-sm">No classrooms yet.</div>
                ) : (
                    <ul className="space-y-2">
                        {classrooms.map((c) => (
                            <li
                                key={c.id}
                                className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                            >
                                <Link href={`/classroom/${c.id}`} className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">{c.name}</div>
                                        {c.description && (
                                            <div className="text-sm text-zinc-400 mt-0.5">{c.description}</div>
                                        )}
                                    </div>
                                    {c.join_code && (
                                        <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                                            {c.join_code}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
