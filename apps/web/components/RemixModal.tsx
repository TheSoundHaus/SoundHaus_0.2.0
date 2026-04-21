"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Check, GitBranch, Monitor } from "lucide-react";

interface RemixModalProps {
  owner: string;
  repo: string;
  cloneUrl?: string;
  onFork: () => void;
  forking: boolean;
  forkError: string | null;
  onClose: () => void;
}

export default function RemixModal({
  owner,
  repo,
  cloneUrl,
  onFork,
  forking,
  forkError,
  onClose,
}: RemixModalProps) {
  const [copied, setCopied] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Prefer backend-provided URL; fall back to constructing from env
  const soundhausLink = cloneUrl || (() => {
    const giteaBase = process.env.NEXT_PUBLIC_GITEA_URL || "https://git.thesound.haus";
    return `${giteaBase}/${owner}/${repo}.git`;
  })();

  useEffect(() => {
    const id = setTimeout(() => setShowContent(true), 80);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(soundhausLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [soundhausLink]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-crossfade-in bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`relative w-full max-w-lg mx-4 glass-card rounded-2xl border border-zinc-700/50 shadow-2xl transition-all duration-300 ${
          showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700/50">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-glass-blue-400" />
            <h2 className="text-lg font-semibold text-zinc-100">
              Remix <span className="text-glass-blue-400">{repo}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Fork on Web */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={15} className="text-glass-blue-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Fork on Web</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Create a copy of this project under your account. Manage snapshots, compare versions, and track your changes on SoundHaus.
            </p>
            <button
              onClick={onFork}
              disabled={forking}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-glass-blue px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-glass-blue/25 transition-all duration-300 hover:bg-glass-blue/90 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <GitBranch size={15} />
              {forking ? "Forking…" : "Fork to My Account"}
            </button>
            {forkError && (
              <p className="mt-2 text-xs text-red-400">{forkError}</p>
            )}
          </div>

          <div className="border-t border-zinc-700/40" />

          {/* Clone to Desktop */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Monitor size={15} className="text-zinc-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Clone to Desktop</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Use the SoundHaus desktop app to clone this project locally and work on it in Ableton Live.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                readOnly
                value={soundhausLink}
                className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-glass-blue/50 cursor-text"
                onClick={() => inputRef.current?.select()}
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700/60 transition-colors shrink-0 cursor-pointer"
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
