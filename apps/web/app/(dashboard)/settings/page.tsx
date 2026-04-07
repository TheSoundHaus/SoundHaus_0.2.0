"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { logout, requestPasswordResetAction } from "@/actions/auth";
import { getSentInvitations } from "@/lib/api/invitations";
import { getUserStats } from "@/lib/api/profile";
import { cancelInvitationAction } from "@/actions/invitations";
import { updateProfileAction } from "@/actions/profile";
import { useUser } from "@/lib/context/UserContext";
import UserAvatar from "@/components/UserAvatar";
import ImageCropper from "@/components/ImageCropper";
import type { SentInvitation } from "@/lib/types/api";
import { Send, X, Clock, CheckCircle, XCircle, Camera, Trash2, Globe, Lock, Mail, Instagram, Youtube, Twitter } from "lucide-react";

export default function SettingsPage() {
  const { user, loading: userLoading, refreshUser } = useUser();
  const [activeTab, setActiveTab] = useState<"profile" | "account" | "invitations" | "stats">(
    "profile"
  );

  const [displayName, setDisplayName] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialYoutube, setSocialYoutube] = useState("");
  const [socialSpotify, setSocialSpotify] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialWebsite, setSocialWebsite] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sentInvitations, setSentInvitations] = useState<SentInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<boolean | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [stats, setStats] = useState<{
    total_repos: number;
    total_commits: number;
    total_clones_received: number;
    collaborations: number;
    total_size_kb: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.username || "");
      setBio(user.bio || "");
      setSocialInstagram(user.social_instagram || "");
      setSocialYoutube(user.social_youtube || "");
      setSocialSpotify(user.social_spotify || "");
      setSocialTwitter(user.social_twitter || "");
      setSocialWebsite(user.social_website || "");
    }
  }, [user]);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    setUsernameError(null);

    // Validate username format
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setUsernameError("Username must be 2–40 characters");
      setProfileSaving(false);
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameError("Only letters, numbers, hyphens, and underscores");
      setProfileSaving(false);
      return;
    }

    const result = await updateProfileAction({
      username: trimmed,
      bio: bio,
      social_instagram: socialInstagram || null,
      social_youtube: socialYoutube || null,
      social_spotify: socialSpotify || null,
      social_twitter: socialTwitter || null,
      social_website: socialWebsite || null,
    });
    if (result.success) {
      setProfileMessage({ type: "success", text: "Profile updated!" });
      await refreshUser();
    } else {
      // Surface uniqueness errors from the backend
      if (result.error?.toLowerCase().includes("already taken")) {
        setUsernameError(result.error);
      }
      setProfileMessage({ type: "error", text: result.error });
    }
    setProfileSaving(false);
  };

  const handleVisibilityToggle = (newValue: boolean) => {
    setPendingVisibility(newValue);
    setVisibilityDialogOpen(true);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetSending(true);
    setResetMessage(null);
    try {
      const result = await requestPasswordResetAction(user.email);
      if (result.success) {
        setResetMessage({ type: "success", text: "Password reset email sent! Check your inbox." });
      } else {
        setResetMessage({ type: "error", text: result.error || "Failed to send reset email." });
      }
    } catch {
      setResetMessage({ type: "error", text: "An error occurred. Please try again." });
    }
    setResetSending(false);
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

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setProfileMessage({ type: "error", text: "Only JPEG, PNG, WebP, or GIF images allowed." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({ type: "error", text: "Image must be under 2 MB." });
      return;
    }

    // Open the cropper with a preview URL
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    setCropSrc(null);
    setAvatarUploading(true);
    setProfileMessage(null);

    const formData = new FormData();
    formData.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));

    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.avatar_url) {
        setProfileMessage({ type: "success", text: "Avatar updated!" });
        await refreshUser();
      } else {
        setProfileMessage({ type: "error", text: data.error || data.detail || "Upload failed" });
      }
    } catch (e) {
      setProfileMessage({ type: "error", text: e instanceof Error ? e.message : "Upload failed" });
    }
    setAvatarUploading(false);
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setProfileMessage(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setProfileMessage({ type: "success", text: "Avatar removed." });
        await refreshUser();
      } else {
        setProfileMessage({ type: "error", text: data.error || data.detail || "Delete failed" });
      }
    } catch (e) {
      setProfileMessage({ type: "error", text: e instanceof Error ? e.message : "Delete failed" });
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

  useEffect(() => {
    if (activeTab === "stats" && !stats && !statsLoading) {
      setStatsLoading(true);
      setStatsError(null);
      getUserStats().then((res) => {
        if (res.success && res.data) {
          setStats(res.data);
        } else if (!res.success) {
          setStatsError(res.error || "Failed to load statistics");
        }
        setStatsLoading(false);
      });
    }
  }, [activeTab, stats, statsLoading]);

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

  function formatStorageSize(kb: number): string {
    if (kb < 1024) return `${kb} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "\u2014";
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
      return iso ?? "\u2014";
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
      case "expired":
        return <XCircle size={14} className="text-yellow-500" />;
      default:
        return <Clock size={14} className="text-zinc-500" />;
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-900/30 text-yellow-400",
      accepted: "bg-green-900/30 text-green-400",
      declined: "bg-red-900/30 text-red-400",
      expired: "bg-yellow-900/30 text-yellow-400",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? "bg-zinc-800 text-zinc-400"}`}>
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
                    ? "bg-zinc-800 text-glass-blue-400"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab("account")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "account"
                    ? "bg-zinc-800 text-glass-blue-400"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveTab("invitations")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "invitations"
                    ? "bg-zinc-800 text-glass-blue-400"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                Invitations
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === "stats"
                    ? "bg-zinc-800 text-glass-blue-400"
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
              <div className="glass-card rounded-xl p-8">
                <h2 className="mb-6 text-2xl font-semibold text-zinc-100">Profile Settings</h2>

                {userLoading ? (
                  <div className="flex items-center gap-3 text-sm text-zinc-400">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                    Loading profile...
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Avatar Section */}
                    <div className="flex items-center gap-6">
                      <div className="relative group">
                        <UserAvatar
                          src={user?.avatar_url}
                          alt={user?.username || "Avatar"}
                          size={80}
                        />
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
                            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Upload
                          </button>
                          {user?.avatar_url && (
                            <button
                              onClick={handleAvatarDelete}
                              disabled={avatarUploading}
                              className="flex items-center gap-1 rounded border border-red-800/50 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/20 disabled:opacity-50"
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
                            ? "border-green-800/50 bg-green-900/20 text-green-400"
                            : "border-red-800/50 bg-red-900/20 text-red-400"
                        }`}
                      >
                        {profileMessage.text}
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-zinc-100">
                        Username
                      </label>
                      <input
                        type="text"
                        placeholder="Your username"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          setUsernameError(null);
                        }}
                        maxLength={40}
                        className={`w-full rounded-md border px-4 py-2 text-zinc-100 bg-zinc-800 focus:ring-1 focus:outline-none transition-all ${usernameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-zinc-700 focus:border-glass-blue-500 focus:ring-glass-blue-500'}`}
                      />
                      {usernameError && (
                        <p className="mt-1 text-xs text-red-400">{usernameError}</p>
                      )}
                      <p className="mt-1 text-xs text-zinc-500">
                        2–40 characters. Letters, numbers, hyphens, and underscores only. Must be unique.
                      </p>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-zinc-100">Bio</label>
                      <textarea
                        placeholder="Tell us about yourself"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        maxLength={500}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                      />
                      <p className="mt-1 text-right text-xs text-zinc-500">
                        {bio.length}/500
                      </p>
                    </div>

                    {/* Social Links */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-zinc-100">Social Links</p>
                      <div className="flex items-center gap-2">
                        <Instagram size={16} className="shrink-0 text-zinc-400" />
                        <input
                          type="url"
                          placeholder="https://instagram.com/yourhandle"
                          value={socialInstagram}
                          onChange={(e) => setSocialInstagram(e.target.value)}
                          maxLength={255}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Youtube size={16} className="shrink-0 text-zinc-400" />
                        <input
                          type="url"
                          placeholder="https://youtube.com/@yourchannel"
                          value={socialYoutube}
                          onChange={(e) => setSocialYoutube(e.target.value)}
                          maxLength={255}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                        <input
                          type="url"
                          placeholder="https://open.spotify.com/artist/..."
                          value={socialSpotify}
                          onChange={(e) => setSocialSpotify(e.target.value)}
                          maxLength={255}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Twitter size={16} className="shrink-0 text-zinc-400" />
                        <input
                          type="url"
                          placeholder="https://x.com/yourhandle"
                          value={socialTwitter}
                          onChange={(e) => setSocialTwitter(e.target.value)}
                          maxLength={255}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe size={16} className="shrink-0 text-zinc-400" />
                        <input
                          type="url"
                          placeholder="https://yourwebsite.com"
                          value={socialWebsite}
                          onChange={(e) => setSocialWebsite(e.target.value)}
                          maxLength={255}
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Profile Visibility Toggle */}
                    <div className="rounded-md border border-zinc-800 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {user?.is_public ? (
                            <Globe size={18} className="text-green-500" />
                          ) : (
                            <Lock size={18} className="text-zinc-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-zinc-100">
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
                            user?.is_public ? "bg-green-500" : "bg-zinc-700"
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
                      className="btn btn-primary rounded-md px-6 py-3 font-medium disabled:opacity-50 disabled:cursor-wait"
                    >
                      {profileSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "account" && (
              <div className="glass-card rounded-xl p-8">
                <h2 className="mb-6 text-2xl font-semibold text-zinc-100">Account Settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-100">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-100">
                      Password
                    </label>
                    <p className="mb-3 text-sm text-zinc-400">
                      For security, password changes are handled via email. Click below and we&apos;ll send a secure reset link to your inbox.
                    </p>
                    {resetMessage && (
                      <div
                        className={`mb-3 rounded-md border px-4 py-3 text-sm ${
                          resetMessage.type === "success"
                            ? "border-green-800/50 bg-green-900/20 text-green-400"
                            : "border-red-800/50 bg-red-900/20 text-red-400"
                        }`}
                      >
                        {resetMessage.text}
                      </div>
                    )}
                    <button
                      onClick={handlePasswordReset}
                      disabled={resetSending}
                      className="flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-wait"
                    >
                      <Mail size={14} />
                      {resetSending ? "Sending..." : "Send Password Reset Email"}
                    </button>
                  </div>
                  <div className="flex gap-4 pt-2 border-t border-zinc-800">
                    <button
                      onClick={() => logout()}
                      className="flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700">
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "invitations" && (
              <div className="glass-card rounded-xl p-8">
                <h2 className="mb-6 text-2xl font-semibold text-zinc-100 flex items-center gap-2">
                  <Send size={20} /> Sent Invitations
                </h2>
                <p className="mb-6 text-sm text-zinc-400">
                  All collaboration invitations you&apos;ve sent across your projects.
                </p>

                {invitationsError && (
                  <div className="mb-4 rounded-md border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                    {invitationsError}
                  </div>
                )}

                {invitationsLoading ? (
                  <p className="text-sm text-zinc-400">Loading invitations...</p>
                ) : sentInvitations.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    You haven&apos;t sent any invitations yet. Go to a project&apos;s Collaborators tab to invite users.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sentInvitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between glass-card rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800">
                            {statusIcon(inv.status)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-zinc-200">
                              {inv.invitee_email}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              {inv.repo_name && (
                                <span className="text-glass-blue-400">{inv.repo_name}</span>
                              )}
                              <span>&middot; {inv.permission} access</span>
                              <span>&middot; Sent {timeAgo(inv.created_at)}</span>
                              {inv.responded_at && (
                                <span>&middot; Responded {timeAgo(inv.responded_at)}</span>
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
                              className="flex items-center gap-1 rounded border border-red-800/50 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/20 disabled:opacity-50"
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
                <div className="glass-card rounded-xl p-8">
                  <h2 className="mb-6 text-2xl font-semibold text-zinc-100">Your Statistics</h2>

                  {statsError && (
                    <div className="mb-4 rounded-md border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                      {statsError}
                    </div>
                  )}

                  {statsLoading ? (
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                      Loading statistics...
                    </div>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="glass-card rounded-lg p-6">
                        <div className="mb-2 text-3xl font-bold text-glass-blue-400">
                          {stats?.total_repos ?? 0}
                        </div>
                        <div className="text-sm text-zinc-400">Total Projects</div>
                      </div>
                      <div className="glass-card rounded-lg p-6">
                        <div className="mb-2 text-3xl font-bold text-emerald-400">
                          {stats?.total_commits ?? 0}
                        </div>
                        <div className="text-sm text-zinc-400">Total Commits</div>
                      </div>
                      <div className="glass-card rounded-lg p-6">
                        <div className="mb-2 text-3xl font-bold text-amber-400">
                          {stats?.collaborations ?? 0}
                        </div>
                        <div className="text-sm text-zinc-400">Collaborations</div>
                      </div>
                      <div className="glass-card rounded-lg p-6">
                        <div className="mb-2 text-3xl font-bold text-glass-cyan-500">
                          {stats ? formatStorageSize(stats.total_size_kb) : "0 B"}
                        </div>
                        <div className="text-sm text-zinc-400">Storage Used</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="glass-card rounded-xl p-8">
                  <h3 className="mb-4 text-xl font-semibold text-zinc-100">Overview</h3>
                  {stats ? (
                    <div className="space-y-3 text-sm text-zinc-400">
                      <div className="flex justify-between border-b border-zinc-800 pb-2">
                        <span>Total Clones Received</span>
                        <span className="font-medium text-zinc-200">{stats.total_clones_received}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-800 pb-2">
                        <span>Projects Owned</span>
                        <span className="font-medium text-zinc-200">{stats.total_repos}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-800 pb-2">
                        <span>Projects Collaborating On</span>
                        <span className="font-medium text-zinc-200">{stats.collaborations}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average Commits per Project</span>
                        <span className="font-medium text-zinc-200">
                          {stats.total_repos > 0
                            ? Math.round(stats.total_commits / stats.total_repos)
                            : 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      {statsLoading ? "Loading..." : "No data available yet."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Visibility Confirmation Dialog */}
      {visibilityDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-800 p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-zinc-100">
              {pendingVisibility ? "Make Profile Public?" : "Make Profile Private?"}
            </h3>

            {pendingVisibility ? (
              <div className="mb-6 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Globe size={16} className="mt-0.5 shrink-0 text-green-500" />
                  <p>
                    <strong className="text-zinc-200">Public</strong> &mdash; Anyone can view
                    your profile, bio, and avatar. Your username will be discoverable
                    by other SoundHaus users.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-6 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Lock size={16} className="mt-0.5 shrink-0 text-zinc-500" />
                  <p>
                    <strong className="text-zinc-200">Private</strong> &mdash; Your profile
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
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmVisibilityChange}
                disabled={visibilitySaving}
                className="btn btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {visibilitySaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Image Cropper Modal */}
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={1}
          onCrop={handleCroppedUpload}
          onCancel={() => setCropSrc(null)}
          cropLabel="Save Avatar"
        />
      )}
      </main>
  );
}
