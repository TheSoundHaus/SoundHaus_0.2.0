"use client";

import { useState, useRef } from "react";
import { Image, Youtube, Upload, Trash2, Eye } from "lucide-react";
import { setThumbnailUrl, deleteThumbnail } from "@/lib/api/repos";
import ImageCropper from "@/components/ImageCropper";

interface ThumbnailSettingsProps {
  owner: string;
  repo: string;
  initialUrl: string | null;
  initialType: "image" | "youtube" | null;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w\-]{11})/,
  );
  return m ? m[1] ?? null : null;
}

export default function ThumbnailSettings({
  owner,
  repo,
  initialUrl,
  initialType,
}: ThumbnailSettingsProps) {
  const [thumbUrl, setThumbUrl] = useState(initialUrl);
  const [thumbType, setThumbType] = useState(initialType);
  const [mode, setMode] = useState<"image" | "youtube">(initialType === "youtube" ? "youtube" : "image");
  const [youtubeInput, setYoutubeInput] = useState(initialType === "youtube" ? (initialUrl ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(file: File) {
    setSaving(true);
    setError(null);
    try {
      // Use the API route directly from the client (File can't cross Server Action boundary)
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/repos/${owner}/${repo}/thumbnail/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.thumbnail_url) {
        setThumbUrl(data.thumbnail_url);
        setThumbType("image");
      } else {
        setError(data.detail || data.error || "Upload failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
    setSaving(false);
  }

  async function handleYoutubeSave() {
    if (!youtubeInput.trim()) return;
    setSaving(true);
    setError(null);
    const res = await setThumbnailUrl(owner, repo, "youtube", youtubeInput.trim());
    setSaving(false);
    if (res.success && res.data) {
      setThumbUrl(res.data.thumbnail_url);
      setThumbType("youtube");
    } else if (!res.success) {
      setError(res.error ?? "Failed to set YouTube thumbnail");
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    const res = await deleteThumbnail(owner, repo);
    setSaving(false);
    if (res.success) {
      setThumbUrl(null);
      setThumbType(null);
      setYoutubeInput("");
    } else {
      setError(res.error ?? "Failed to remove thumbnail");
    }
  }

  const videoId = thumbType === "youtube" && thumbUrl ? extractYouTubeId(thumbUrl) : null;

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <Image size={14} /> Thumbnail
        </h3>
        {thumbUrl && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 text-xs text-glass-blue-400 hover:text-glass-blue-400/80 transition-colors"
          >
            <Eye size={12} /> {showPreview ? "Hide" : "Show"} Preview
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Mode toggle */}
      <div className="mb-4 flex rounded-md border border-zinc-700 overflow-hidden w-fit">
        <button
          onClick={() => setMode("image")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "image" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Upload size={12} /> Image
        </button>
        <button
          onClick={() => setMode("youtube")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "youtube" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Youtube size={12} /> YouTube
        </button>
      </div>

      {/* Image upload */}
      {mode === "image" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)) {
                  setError("Only JPEG, PNG, WebP, or GIF images allowed.");
                  return;
                }
                if (f.size > 5 * 1024 * 1024) {
                  setError("Image must be under 5 MB.");
                  return;
                }
                const url = URL.createObjectURL(f);
                setCropSrc(url);
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            className="btn btn-primary btn-sm"
          >
            <Upload size={14} /> {saving ? "Uploading..." : "Upload Image"}
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            JPEG, PNG, WebP, or GIF — max 5 MB
          </p>
        </div>
      )}

      {/* YouTube URL input */}
      {mode === "youtube" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={youtubeInput}
            onChange={(e) => setYoutubeInput(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-glass-blue focus:outline-none"
          />
          <button
            onClick={handleYoutubeSave}
            disabled={saving || !youtubeInput.trim()}
            className="btn btn-primary btn-sm"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {/* Current thumbnail display */}
      {thumbUrl && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Current: {thumbType === "youtube" ? "YouTube video" : "Image"}
            </span>
            <button
              onClick={handleRemove}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
          {thumbType === "image" && (
            <img
              src={thumbUrl}
              alt="Current thumbnail"
              className="w-full max-w-xs h-32 object-cover rounded-lg border border-zinc-700"
            />
          )}
          {thumbType === "youtube" && videoId && (
            <img
              src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
              alt="YouTube thumbnail"
              className="w-full max-w-xs h-32 object-cover rounded-lg border border-zinc-700"
            />
          )}
        </div>
      )}

      {/* Explore card preview */}
      {showPreview && thumbUrl && (
        <div className="mt-4 rounded-lg border border-zinc-600/50 bg-zinc-900 p-4">
          <p className="mb-2 text-xs text-zinc-500 uppercase tracking-wider">
            Explore card preview
          </p>
          <div className="max-w-xs rounded-card border border-white/10 bg-zinc-900 p-4">
            {thumbType === "image" ? (
              <img
                src={thumbUrl}
                alt="preview"
                className="w-full h-32 object-cover rounded-card mb-3"
              />
            ) : videoId ? (
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt="preview"
                className="w-full h-32 object-cover rounded-card mb-3"
              />
            ) : null}
            <h4 className="text-sm font-semibold text-zinc-200 truncate">{repo}</h4>
            <p className="text-xs text-zinc-500">by {owner}</p>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={16 / 9}
          onCrop={async (blob) => {
            setCropSrc(null);
            const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
            await handleImageUpload(file);
          }}
          onCancel={() => setCropSrc(null)}
          cropLabel="Save Thumbnail"
        />
      )}
    </div>
  );
}
