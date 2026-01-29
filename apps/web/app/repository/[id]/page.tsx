"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

/**
 * Repository View Page - Display detailed information about a repository
 * Shows commit history, audio files, collaborators, and repository metadata
 * API Calls:
 * - Get Commit History (returns array of commit objects)
 * - Fetch Audio Files (returns array of audio files and metadata)
 * - Invite Collaborator (adds collaborator with permissions)
 * - Clone Repository (triggers Desktop app to clone)
 */
export default function RepositoryPage() {
  const params = useParams();
  const repoId = params.id;
  const [activeTab, setActiveTab] = useState<"overview" | "commits" | "files" | "settings">("overview");

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      {/* Navigation Header */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            SoundHaus
          </Link>
          <div className="flex gap-4">
            <Link
              href="/explore"
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
            >
              Explore
            </Link>
            <Link
              href="/repositories"
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
            >
              My Repositories
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Repository Header */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
            <Link href="/repositories" className="hover:text-zinc-100">
              Repositories
            </Link>
            <span>/</span>
            <span>Repository #{repoId}</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-4xl font-bold tracking-tight">
                My Awesome Project
              </h1>
              <p className="mb-4 text-lg text-zinc-400">
                A collaborative Ableton project exploring ambient soundscapes
              </p>
              <div className="flex gap-4 text-sm text-zinc-400">
                <span>👤 by username</span>
                <span>•</span>
                <span>🔒 Private</span>
                <span>•</span>
                <span>Updated 2 days ago</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
                Open in Desktop
              </button>
              <button className="rounded-md border border-zinc-700 px-6 py-3 font-medium transition-colors hover:bg-zinc-800">
                Clone
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-zinc-800">
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`border-b-2 pb-4 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("commits")}
              className={`border-b-2 pb-4 text-sm font-medium transition-colors ${
                activeTab === "commits"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Commits
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className={`border-b-2 pb-4 text-sm font-medium transition-colors ${
                activeTab === "files"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`border-b-2 pb-4 text-sm font-medium transition-colors ${
                activeTab === "settings"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Content Area */}
        {activeTab === "overview" && (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Project Stats */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h2 className="mb-4 text-xl font-semibold">Project Stats</h2>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-2xl font-bold">24</div>
                    <div className="text-sm text-zinc-400">Commits</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">8</div>
                    <div className="text-sm text-zinc-400">Tracks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">3</div>
                    <div className="text-sm text-zinc-400">Collaborators</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">1.2 GB</div>
                    <div className="text-sm text-zinc-400">Size</div>
                  </div>
                </div>
              </div>

              {/* Recent Commits */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h2 className="mb-4 text-xl font-semibold">Recent Commits</h2>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-start gap-4 border-b border-zinc-800 pb-4 last:border-0"
                    >
                      <div className="h-10 w-10 rounded-full bg-zinc-800"></div>
                      <div className="flex-1">
                        <div className="mb-1 font-medium">
                          Add new ambient pad sound
                        </div>
                        <div className="text-sm text-zinc-400">
                          username committed 2 days ago
                        </div>
                      </div>
                      <div className="text-sm text-zinc-400">abc123f</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Collaborators */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="mb-4 text-lg font-semibold">Collaborators</h3>
                <div className="mb-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-800"></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Username {i}</div>
                        <div className="text-xs text-zinc-400">
                          {i === 1 ? "Owner" : "Collaborator"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800">
                  + Invite Collaborator
                </button>
              </div>

              {/* Repository Info */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="mb-4 text-lg font-semibold">Repository Info</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Created</span>
                    <span>Jan 15, 2025</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Last Push</span>
                    <span>2 days ago</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Default Branch</span>
                    <span>main</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "commits" && (
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-6 text-2xl font-semibold">Commit History</h2>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 border-b border-zinc-800 pb-4 last:border-0"
                >
                  <div className="h-10 w-10 rounded-full bg-zinc-800"></div>
                  <div className="flex-1">
                    <div className="mb-1 font-medium">Commit message {i}</div>
                    <div className="text-sm text-zinc-400">
                      username committed {i} days ago
                    </div>
                  </div>
                  <div className="text-sm font-mono text-zinc-400">abc123f</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "files" && (
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-6 text-2xl font-semibold">Audio Files</h2>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 p-4 transition-colors hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800">
                      🎵
                    </div>
                    <div>
                      <div className="font-medium">track_{i}.wav</div>
                      <div className="text-sm text-zinc-400">2.4 MB</div>
                    </div>
                  </div>
                  <button className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-700">
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-6 text-2xl font-semibold">Repository Settings</h2>
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Repository Name
                </label>
                <input
                  type="text"
                  placeholder="my-awesome-project"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Description
                </label>
                <textarea
                  placeholder="Project description"
                  rows={3}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Visibility
                </label>
                <select className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none">
                  <option>Private</option>
                  <option>Public</option>
                </select>
              </div>
              <div className="flex gap-4">
                <button className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
                  Save Changes
                </button>
                <button className="rounded-md border border-red-500 px-6 py-3 font-medium text-red-500 transition-colors hover:bg-red-500/10">
                  Delete Repository
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
