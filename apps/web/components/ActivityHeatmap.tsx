"use client";

import { useEffect, useState, useMemo } from "react";
import { getActivityHeatmap, type HeatmapDay } from "@/lib/api/dashboard";

const DAYS = 365;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function isoDate(d: Date): string {
    return d.toISOString().split("T")[0]!;
}

function buildGrid(): Date[] {
    // Start from the first Sunday on or before 365 days ago
    const start = new Date(TODAY);
    start.setDate(start.getDate() - DAYS);
    const dayOfWeek = start.getDay(); // 0=Sun
    start.setDate(start.getDate() - dayOfWeek);

    const dates: Date[] = [];
    const cur = new Date(start);
    while (cur <= TODAY) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function levelColor(count: number): string {
    if (count === 0) return "bg-zinc-800/60";
    if (count === 1) return "bg-[#A7C7E7]/25";
    if (count <= 3) return "bg-[#A7C7E7]/55";
    if (count <= 6) return "bg-[#A7C7E7]/80";
    return "bg-[#A7C7E7]";
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ActivityHeatmap() {
    const [days, setDays] = useState<HeatmapDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

    useEffect(() => {
        getActivityHeatmap().then((res) => {
            if (res.success && res.data) setDays(res.data);
            setLoading(false);
        });
    }, []);

    const countMap = useMemo(() => {
        const m: Record<string, number> = {};
        for (const d of days) m[d.date] = d.count;
        return m;
    }, [days]);

    const totalActivity = useMemo(() => days.reduce((s, d) => s + d.count, 0), [days]);

    const grid = useMemo(() => buildGrid(), []);

    // Group grid dates into columns (weeks), each column = 7 days Sun→Sat
    const columns: Date[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
        columns.push(grid.slice(i, i + 7));
    }

    // Month label positions: for each column, check if it crosses a month boundary
    const monthPositions: { label: string; col: number }[] = [];
    let lastMonth = -1;
    columns.forEach((col, ci) => {
        const firstDay = col[0];
        if (!firstDay) return;
        const m = firstDay.getMonth();
        if (m !== lastMonth) {
            monthPositions.push({ label: MONTH_LABELS[m]!, col: ci });
            lastMonth = m;
        }
    });

    return (
        <div className="glass-card rounded-xl p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-zinc-100">Activity</h2>
                <span className="text-xs text-zinc-500">
                    {loading ? "…" : `${totalActivity} push${totalActivity !== 1 ? "es" : ""} in the last year`}
                </span>
            </div>

            {loading ? (
                <div className="h-28 rounded-lg bg-zinc-800/40 animate-pulse" />
            ) : (
                <div className="overflow-x-auto">
                    <div className="relative" style={{ minWidth: columns.length * 14 }}>
                        {/* Month labels */}
                        <div className="relative h-5 mb-1">
                            {monthPositions.map(({ label, col }) => (
                                <span
                                    key={`${label}-${col}`}
                                    className="absolute text-[10px] text-zinc-500"
                                    style={{ left: col * 14 }}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>

                        {/* Grid */}
                        <div className="flex gap-[2px]">
                            {columns.map((col, ci) => (
                                <div key={ci} className="flex flex-col gap-[2px]">
                                    {col.map((date) => {
                                        const iso = isoDate(date);
                                        const count = countMap[iso] ?? 0;
                                        const isFuture = date > TODAY;
                                        return (
                                            <div
                                                key={iso}
                                                className={`w-3 h-3 rounded-sm transition-opacity ${isFuture ? "opacity-0 pointer-events-none" : levelColor(count)} cursor-default`}
                                                onMouseEnter={(e) => {
                                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                    setTooltip({
                                                        text: count === 0
                                                            ? `No activity · ${iso}`
                                                            : `${count} push${count !== 1 ? "es" : ""} · ${iso}`,
                                                        x: rect.left + rect.width / 2,
                                                        y: rect.top - 6,
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* Legend */}
                        <div className="mt-3 flex items-center gap-1.5 justify-end">
                            <span className="text-[10px] text-zinc-600">Less</span>
                            {["bg-zinc-800/60", "bg-[#A7C7E7]/25", "bg-[#A7C7E7]/55", "bg-[#A7C7E7]/80", "bg-[#A7C7E7]"].map((cls, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
                            ))}
                            <span className="text-[10px] text-zinc-600">More</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed tooltip rendered outside scroll container */}
            {tooltip && (
                <div
                    className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 shadow-lg whitespace-nowrap"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    {tooltip.text}
                </div>
            )}
        </div>
    );
}
