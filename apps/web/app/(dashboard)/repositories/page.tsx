"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Personal Repositories Page - Manage user's remote repositories
 * Displays authenticated user's repositories with CRUD operations
 * API Calls:
 * - Get personal repos (returns array of N personal repos)
 * - Repository CRUD Operations
 * - Delete Remote (removes repository from Digital Ocean)
 */
export default function RepositoriesPage() {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">
              Your Repositories
            </h1>
            <p className="text-lg text-zinc-400">
              Manage your remote Ableton projects
            </p>
          </div>
          <button className="btn btn-primary">
            + New Repository
          </button>
        </div>

        {/* View Toggle and Stats */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-6 text-sm text-glass-cyan-500">
            <span>12 Repositories</span>
            <span>•</span>
            <span>3 Collaborations</span>
            <span>•</span>
            <span>142 Total Commits</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                view === "grid"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                view === "list"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Repository Grid - Placeholder */}
        <div
          className={
            view === "grid"
              ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-4"
          }
        >
          {/* Placeholder cards - will be populated via API */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`rounded-lg border border-zinc-800 p-6 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_20px_rgba(167,199,231,0.12)] group cursor-pointer ${
                view === "list" ? "flex items-center justify-between" : ""
              }`}
            >
              <div className={view === "list" ? "flex-1" : ""}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold group-hover:text-glass-blue-400 transition-colors duration-300">
                    My Project {i}
                  </h3>
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Private</span>
                </div>
                <p className="mb-4 text-sm text-zinc-400">
                  Last updated 3 days ago
                </p>
                <div className="flex gap-4 text-sm text-glass-cyan-500">
                  <span>🎵 8 tracks</span>
                  <span>👥 2 collaborators</span>
                  <span>📊 24 commits</span>
                </div>
              </div>
              {view === "list" && (
                <div className="flex gap-2">
                  <button className="btn btn-primary text-sm">
                    Open in Desktop
                  </button>
                  <button className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800 transition-colors duration-300">
                    Settings
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
  );
}
