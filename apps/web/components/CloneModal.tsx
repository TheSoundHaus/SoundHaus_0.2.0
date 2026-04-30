"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Copy, Check, Music } from "lucide-react";

interface CloneModalProps {
  owner: string;
  repo: string;
  cloneUrl?: string;
  onClose: () => void;
}

function getRepositoryLink(owner: string, repo: string, cloneUrl?: string): string {
  const giteaBase = process.env.NEXT_PUBLIC_GITEA_URL || "https://git.thesound.haus";
  const fallback = `${giteaBase}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  if (!cloneUrl) return fallback;

  try {
    const url = new URL(cloneUrl);
    url.username = "";
    url.password = "";
    url.pathname = url.pathname.replace(/\.git$/, "");
    return url.toString();
  } catch {
    return cloneUrl.replace(/\.git$/, "") || fallback;
  }
}

export default function CloneModal({ owner, repo, cloneUrl, onClose }: CloneModalProps) {
  const [copied, setCopied] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const repositoryLink = getRepositoryLink(owner, repo, cloneUrl);

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

  useEffect(() => {
    if (showContent) inputRef.current?.select();
  }, [showContent]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(repositoryLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [repositoryLink]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-crossfade-in bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`relative w-full max-w-md mx-4 rounded-xl border border-glass-blue/20 bg-zinc-900 shadow-elevation-4 transition-all ${
          showContent ? "animate-remix-slide-up" : "opacity-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-glass-blue/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-glass-blue/10">
              <Music size={16} className="text-glass-blue" />
            </div>
            <h2 className="text-lg font-semibold text-soft-white">Remix this project</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-charcoal hover:text-soft-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="mb-3 text-sm text-muted-300">
            Paste this clone URL into the <strong>Clone Project</strong> window in the
            SoundHaus Desktop app to remix this project.
          </p>

          {/* URL input + copy button */}
          <div
            className={`flex items-stretch rounded-lg border transition-all ${
              copied
                ? "border-success/40 animate-copy-flash"
                : "border-glass-blue/20 focus-within:border-glass-blue/50"
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={repositoryLink}
              className="flex-1 bg-navy/60 px-3 py-2.5 text-sm text-soft-white font-mono rounded-l-lg outline-none selection:bg-glass-blue/30"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-4 text-sm font-medium transition-all rounded-r-lg ${
                copied
                  ? "bg-success/20 text-success"
                  : "bg-glass-blue/10 text-glass-blue hover:bg-glass-blue/20"
              }`}
            >
              {copied ? (
                <>
                  <span className="inline-block animate-checkmark-pop">
                    <Check size={14} />
                  </span>
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>
          </div>


        </div>
      </div>
    </div>
  );
}
