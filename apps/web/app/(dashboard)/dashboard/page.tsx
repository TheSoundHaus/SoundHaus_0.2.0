"use client";

import Link from "next/link";

/**
 * Dashboard Page - Main authenticated home page
 * Git-inspired minimal design showing recent activity and quick actions
 * API Calls:
 * - Get user's recent activity
 * - Get user's repository overview
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-lg text-zinc-400">
          Welcome back to SoundHaus
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 p-6 bg-zinc-900/50">
              <div className="text-3xl font-bold text-glass-blue-400">12</div>
              <div className="text-sm text-zinc-400">Repositories</div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-6 bg-zinc-900/50">
              <div className="text-3xl font-bold text-glass-blue-400">142</div>
              <div className="text-sm text-zinc-400">Commits</div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-6 bg-zinc-900/50">
              <div className="text-3xl font-bold text-glass-blue-400">8</div>
              <div className="text-sm text-zinc-400">Collaborations</div>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-4 text-xl font-semibold">Recent Activity</h2>
            <div className="space-y-4">
              {/* Activity Items - Placeholder */}
              {[
                { action: "Pushed 3 commits to", repo: "My Project 1", time: "2 hours ago" },
                { action: "Created repository", repo: "New Track Ideas", time: "1 day ago" },
                { action: "Added collaborator to", repo: "Beat Collection", time: "2 days ago" },
                { action: "Updated", repo: "Summer Mix 2024", time: "3 days ago" },
              ].map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 border-b border-zinc-800 pb-4 last:border-0 last:pb-0"
                >
                  <div className="mt-1 w-2 h-2 rounded-full bg-glass-blue-500"></div>
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className="text-zinc-300">{activity.action} </span>
                      <Link
                        href={`/repository/${i}`}
                        className="font-semibold text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                      >
                        {activity.repo}
                      </Link>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">{activity.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <h3 className="mb-4 text-lg font-semibold">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/repositories"
                className="block rounded-md border border-zinc-700 px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:text-glass-blue-400"
              >
                + New Repository
              </Link>
              <Link
                href="/explore"
                className="block rounded-md border border-zinc-700 px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:text-glass-blue-400"
              >
                Explore Projects
              </Link>
              <Link
                href="/settings"
                className="block rounded-md border border-zinc-700 px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:text-glass-blue-400"
              >
                Settings
              </Link>
            </div>
          </div>

          {/* Your Repositories */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Your Repositories</h3>
              <Link
                href="/repositories"
                className="text-xs text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {/* Repository Links - Placeholder */}
              {["My Project 1", "Beat Collection", "Summer Mix 2024"].map((repo, i) => (
                <Link
                  key={i}
                  href={`/repository/${i}`}
                  className="block group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium group-hover:text-glass-blue-400 transition-colors">
                      {repo}
                    </span>
                    <span className="text-xs text-zinc-500">Private</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Updated 2d ago
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
