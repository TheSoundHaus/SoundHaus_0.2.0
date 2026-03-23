"use client";

import Link from "next/link";
import { GitBranch, Music, Users, FolderGit2, Compass, Settings } from "lucide-react";

/**
 * Dashboard Page - Main authenticated home page
 * Polished design matching landing page aesthetic
 * Glass cards, subtle glows, consistent spacing
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Welcome Header */}
      <div className="mb-10">
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
            {[
              { icon: FolderGit2, value: "12", label: "Projects", color: "text-glass-blue-400" },
              { icon: GitBranch, value: "142", label: "Commits", color: "text-emerald-400" },
              { icon: Users, value: "8", label: "Collaborations", color: "text-amber-400" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="group rounded-xl border border-zinc-800 p-6 bg-zinc-900/50 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`w-5 h-5 ${stat.color} opacity-70`} />
                </div>
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Recent Activity Feed */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-5 text-xl font-semibold flex items-center gap-2">
              <Music className="w-5 h-5 text-glass-blue-400 opacity-70" />
              Recent Activity
            </h2>
            <div className="space-y-1">
              {[
                { action: "Pushed 3 commits to", repo: "My Project 1", time: "2 hours ago" },
                { action: "Created project", repo: "New Track Ideas", time: "1 day ago" },
                { action: "Added collaborator to", repo: "Beat Collection", time: "2 days ago" },
                { action: "Updated", repo: "Summer Mix 2024", time: "3 days ago" },
              ].map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-800/40"
                >
                  <div className="mt-2 w-1.5 h-1.5 rounded-full bg-glass-blue-500 shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="text-zinc-300">{activity.action} </span>
                      <Link
                        href={`/repository/${i}`}
                        className="font-semibold text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                      >
                        {activity.repo}
                      </Link>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{activity.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { href: "/repositories", label: "Browse Projects", icon: FolderGit2 },
                { href: "/explore", label: "Explore Projects", icon: Compass },
                { href: "/settings", label: "Settings", icon: Settings },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-500/30 hover:bg-zinc-800/50 hover:text-glass-blue-400 group"
                >
                  <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-glass-blue-400 transition-colors" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Your Projects */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Your Projects</h3>
              <Link
                href="/repositories"
                className="text-xs text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="space-y-1">
              {["My Project 1", "Beat Collection", "Summer Mix 2024"].map((repo, i) => (
                <Link
                  key={i}
                  href={`/repository/${i}`}
                  className="block group rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-800/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium group-hover:text-glass-blue-400 transition-colors">
                      {repo}
                    </span>
                    <span className="text-xs text-zinc-600">Private</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
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
