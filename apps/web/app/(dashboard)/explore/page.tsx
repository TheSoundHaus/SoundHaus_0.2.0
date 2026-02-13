"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Explore Page - Browse and discover public repositories
 * Displays top N repositories with sorting and filtering options
 * API Call: Get Top N Repos (returns array of repo overviews)
 */
export default function ExplorePage() {
  const [sortBy, setSortBy] = useState<"top" | "recent" | "trending">("top");

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">
            Explore
          </h1>
          <p className="text-lg text-zinc-400">
            Discover public Ableton projects from the community
          </p>
        </div>

        {/* Filters and Sorting */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("top")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                sortBy === "top"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              Top Rated
            </button>
            <button
              onClick={() => setSortBy("recent")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                sortBy === "recent"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy("trending")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                sortBy === "trending"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              Trending
            </button>
          </div>
          <input
            type="search"
            placeholder="Search repositories..."
            className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all duration-300"
          />
        </div>

        {/* Repository Grid - Placeholder */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Placeholder cards - will be populated via API */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-800 p-6 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_20px_rgba(167,199,231,0.12)] cursor-pointer group"
            >
              <div className="mb-4 h-32 rounded bg-zinc-800"></div>
              <h3 className="mb-2 text-lg font-semibold group-hover:text-glass-blue-400 transition-colors duration-300">
                Repository Title
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                By Username • Updated 2 days ago
              </p>
              <div className="flex gap-4 text-sm text-glass-cyan-500">
                <span>⭐ 42</span>
                <span>🎵 12 tracks</span>
                <span>👥 3 collaborators</span>
              </div>
            </div>
          ))}
        </div>
      </main>
  );
}
