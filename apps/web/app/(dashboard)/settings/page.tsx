"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { logout } from "@/actions/auth";
import { getSentInvitations } from "@/lib/api/invitations";
import { cancelInvitationAction } from "@/actions/invitations";
import { updateProfileAction, uploadAvatarAction, deleteAvatarAction } from "@/actions/profile";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "@/components/UserAvatar";
import type { SentInvitation } from "@/lib/types/api";
import { Send, X, Clock, CheckCircle, XCircle, Camera, Trash2, Globe, Lock } from "lucide-react";

/**
 * User Profile Page - Profile settings, account, stats, and invitation management
 * API Calls:
 * - GET /api/auth/profile (via UserProvider context)
 * - PUT /api/auth/profile (update display_name, bio)
 * - POST /api/auth/profile/avatar (upload avatar)
 * - DELETE /api/auth/profile/avatar (remove avatar)
 * - GET /invitations/sent (all invitations sent by user)
 * - DELETE /invitations/{id} (cancel pending invitation)
 * - Logout (revokes session token)
 */
export default function SettingsPage() {
  const { user, loading: userLoading, refreshUser } = useUser();
  const [activeTab, setActiveTab] = useState<"profile" | "account" | "invitations" | "stats">(
    "profile"
  );

  // Profile form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Avatar state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invitations state
  const [sentInvitations, setSentInvitations] = useState<SentInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Visibility toggle state
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<boolean | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  // Populate form when user data loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
    }
  }, [user]);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    const result = await updateProfileAction({
      display_name: displayName,
      bio: bio,
    });
    if (result.success) {
      setProfileMessage({ type: "success", text: "Profile updated!" });
      await refreshUser();
    } else {
      setProfileMessage({ type: "error", text: result.error });
    }
    setProfileSaving(false);
  };

  const handleVisibilityToggle = (newValue: boolean) => {
    setPendingVisibility(newValue);
    setVisibilityDialogOpen(true);
  };

  const confirmVisibilityChange = async () => {
    if (pendingVisibility === null) return;
    setVisibilitySaving(true);
    setProfileMessage(null);
    const result = await updateProfileAction({ is_public: pendingVisibility });
    if (result.success) {
      setProfileMessage({
        type: "success",
        text: pendingVisibility
          ? "Your profile is now public!"
          : "Your profile is now private.",
      });
      await refreshUser();
    } else {
      setProfileMessage({ type: "error", text: result.error });
    }
    setVisibilitySaving(false);
    setVisibilityDialogOpen(false);
    setPendingVisibility(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setProfileMessage({ type: "error", text: "Only JPEG, PNG, WebP, or GIF images allowed." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({ type: "error", text: "Image must be under 2 MB." });
      return;
    }

    setAvatarUploading(true);
    setProfileMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadAvatarAction(formData);
    if (result.success) {
      setProfileMessage({ type: "success", text: "Avatar updated!" });
      await refreshUser();
    } else {
      setProfileMessage({ type: "error", text: result.error });
    }
    setAvatarUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setProfileMessage(null);
    const result = await deleteAvatarAction();
    if (result.success) {
      setProfileMessage({ type: "success", text: "Avatar removed." });
      await refreshUser();
    } else {
      setProfileMessage({ type: "error", text: result.error });
    }
    setAvatarUploading(false);
  };

  const loadInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    setInvitationsError(null);
    const res = await getSentInvitations();
    if (res.success) {
      setSentInvitations(res.data ?? []);
    } else {
      setInvitationsError(res.error ?? "Failed to load invitations");
    }
    setInvitationsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "invitations") {
      loadInvitations();
    }
  }, [activeTab, loadInvitations]);

  const handleCancelInvite = async (id: string) => {
    setCancellingId(id);
    const result = await cancelInvitationAction(id);
    if (result.success) {
      loadInvitations();
    } else {
      setInvitationsError(result.error);
    }
    setCancellingId(null);
  };

  // Format relative time
  function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch {
      return iso ?? "—";
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock size={14} className="text-yellow-500" />;
      case "accepted":
        return <CheckCircle size={14} className="text-green-500" />;
      case "declined":
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <Clock size={14} className="text-zinc-500" />;
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-500/10 text-yellow-400",
      accepted: "bg-green-500/10 text-green-400",
      declined: "bg-red-500/10 text-red-400",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? "bg-zinc-500/10 text-zinc-400"}`}>
        {status}
      </span>
    );
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">Profile</h1>
          <p className="text-lg text-zinc-400">
            Manage your account, view statistics, and track invitations
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
                onClick={() => setActiveTab("invitations")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "invitations"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Invitations
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

                {userLoading ? (
                  <div className="flex items-center gap-3 text-sm text-zinc-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                    Loading profile…
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Avatar Section */}
                    <div className="flex items-center gap-6">
                      <div className="relative group">
                        <UserAvatar
                          src={user?.avatar_url}
                          alt={user?.display_name || user?.username || "Avatar"}
                          size={80}
                        />
                        {/* Upload overlay */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-wait"
                        >
                          {avatarUploading ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
                          ) : (
                            <Camera size={20} className="text-white" />
                          )}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-200">Profile Picture</p>
                        <p className="text-xs text-zinc-500 mb-2">JPEG, PNG, WebP, or GIF. Max 2 MB.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={avatarUploading}
                            className="rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Upload
                          </button>
                          {user?.avatar_url && (
                            <button
                              onClick={handleAvatarDelete}
                              disabled={avatarUploading}
                              className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status message */}
                    {profileMessage && (
                      <div
                        className={`rounded-md border px-4 py-3 text-sm ${
                          profileMessage.type === "success"
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-red-500/30 bg-red-500/10 text-red-400"
                        }`}
                      >
                        {profileMessage.text}
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Username
                      </label>
                      <input
                        type="text"
                        value={user?.username || ""}
                        disabled
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-zinc-500 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-zinc-600">Username cannot be changed.</p>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Display Name
                      </label>
                      <input
                        type="text"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Bio</label>
                      <textarea
                        placeholder="Tell us about yourself"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        maxLength={500}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 focus:border-zinc-500 focus:outline-none"
                      />
                      <p className="mt-1 text-right text-xs text-zinc-600">
                        {bio.length}/500
                      </p>
                    </div>

                    {/* Profile Visibility Toggle */}
                    <div className="rounded-md border border-zinc-700 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {user?.is_public ? (
                            <Globe size={18} className="text-green-400" />
                          ) : (
                            <Lock size={18} className="text-zinc-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              Profile Visibility
                            </p>
                            <p className="text-xs text-zinc-500">
                              {user?.is_public ? "Your profile is public" : "Your profile is private"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVisibilityToggle(!user?.is_public)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            user?.is_public ? "bg-green-500" : "bg-zinc-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                              user?.is_public ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleProfileSave}
                      disabled={profileSaving}
                      className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {profileSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                )}
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
                      value={user?.email || ""}
                      disabled
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-zinc-500 cursor-not-allowed"
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
                    <button
                      onClick={() => logout()}
                      className="rounded-md border border-red-500 px-6 py-3 font-medium text-red-500 transition-colors hover:bg-red-500/10">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "invitations" && (
              <div className="rounded-lg border border-zinc-800 p-8">
                <h2 className="mb-6 text-2xl font-semibold flex items-center gap-2">
                  <Send size={20} /> Sent Invitations
                </h2>
                <p className="mb-6 text-sm text-zinc-400">
                  All collaboration invitations you&apos;ve sent across your projects.
                </p>

                {invitationsError && (
                  <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {invitationsError}
                  </div>
                )}

                {invitationsLoading ? (
                  <p className="text-sm text-zinc-500">Loading invitations…</p>
                ) : sentInvitations.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    You haven&apos;t sent any invitations yet. Go to a project&apos;s Collaborators tab to invite users.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sentInvitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-md border border-zinc-700/50 bg-zinc-800/30 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700">
                            {statusIcon(inv.status)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-zinc-200">
                              {inv.invitee_email}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              {inv.repo_name && (
                                <span className="text-glass-cyan-500">{inv.repo_name}</span>
                              )}
                              <span>· {inv.permission} access</span>
                              <span>· Sent {timeAgo(inv.created_at)}</span>
                              {inv.responded_at && (
                                <span>· Responded {timeAgo(inv.responded_at)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {statusBadge(inv.status)}
                          {inv.status === "pending" && (
                            <button
                              onClick={() => handleCancelInvite(inv.id)}
                              disabled={cancellingId === inv.id}
                              className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <X size={11} /> Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "stats" && (
              <div className="space-y-6">
                {/* TODO: Fetch real user statistics from API */}
                <div className="rounded-lg border border-zinc-800 p-8">
                  <h2 className="mb-6 text-2xl font-semibold">Your Statistics</h2>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">&mdash;</div>
                      <div className="text-sm text-zinc-400">
                        Total Projects
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">&mdash;</div>
                      <div className="text-sm text-zinc-400">Total Commits</div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">&mdash;</div>
                      <div className="text-sm text-zinc-400">Collaborations</div>
                    </div>
                    <div className="rounded-lg bg-zinc-800 p-6">
                      <div className="mb-2 text-3xl font-bold">&mdash;</div>
                      <div className="text-sm text-zinc-400">Storage Used</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 p-8">
                  {/* TODO: Fetch real activity feed from API */}
                  <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
                  <p className="text-sm text-zinc-500">No recent activity to display.</p>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Visibility Confirmation Dialog */}
      {visibilityDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">
              {pendingVisibility ? "Make Profile Public?" : "Make Profile Private?"}
            </h3>

            {pendingVisibility ? (
              <div className="mb-6 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Globe size={16} className="mt-0.5 shrink-0 text-green-400" />
                  <p>
                    <strong className="text-zinc-200">Public</strong> — Anyone can view
                    your profile, bio, and avatar. Your username will be discoverable
                    by other SoundHaus users.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-6 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Lock size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                  <p>
                    <strong className="text-zinc-200">Private</strong> — Your profile
                    page will not be visible to others. Collaborators can still see
                    your username within shared projects.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setVisibilityDialogOpen(false);
                  setPendingVisibility(null);
                }}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmVisibilityChange}
                disabled={visibilitySaving}
                className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
              >
                {visibilitySaving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
  );
}
