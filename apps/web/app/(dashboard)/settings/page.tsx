"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * User Settings Page - General settings and user statistics
 * Displays user preferences, account settings, and usage stats
 * API Calls:
 * - User CRUD Operations (update profile, password, etc.)
 * - Logout (revokes session token)
 */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "account" | "stats">(
    "profile"
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">Settings</h1>
          <p className="text-lg text-zinc-400">
            Manage your account and view statistics
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-4">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="flex flex-col gap-2">
              <button
                onClick={() => setActiveTab("profile")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "profile"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab("account")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "account"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "stats"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Statistics
              </button>
            </nav>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            {activeTab === "profile" && (
              <div className="rounded-lg border border-zinc-800 p-8">
                <h2 className="mb-6 text-2xl font-semibold">Profile Settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="Your name"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="username"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Bio</label>
                    <textarea
                      placeholder="Tell us about yourself"
                      rows={4}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                  <button className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="rounded-lg border border-zinc-800 p-8">
                <h2 className="mb-6 text-2xl font-semibold">Account Settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="email@example.com"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Change Password
                    </label>
                    <input
                      type="password"
                      placeholder="New password"
                      className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="Confirm password"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
                      Update Account
                    </button>
                    <button className="rounded-md border border-red-500 px-6 py-3 font-medium text-red-500 transition-colors hover:bg-red-500/10">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "stats" && (
              <div className="space-y-6">
                <div className="rounded-lg border border-zinc-800 p-8">
                  <h2 className="mb-6 text-2xl font-semibold">Your Statistics</h2>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">12</div>
                      <div className="text-sm text-zinc-400">
                        Total Repositories
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">142</div>
                      <div className="text-sm text-zinc-400">Total Commits</div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">8</div>
                      <div className="text-sm text-zinc-400">Collaborations</div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">2.4 GB</div>
                      <div className="text-sm text-zinc-400">Storage Used</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 p-8">
                  <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                      <div>
                        <div className="font-medium">Pushed to My Project 1</div>
                        <div className="text-sm text-zinc-400">2 hours ago</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                      <div>
                        <div className="font-medium">Created new repository</div>
                        <div className="text-sm text-zinc-400">1 day ago</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Added collaborator</div>
                        <div className="text-sm text-zinc-400">3 days ago</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
  );
}
