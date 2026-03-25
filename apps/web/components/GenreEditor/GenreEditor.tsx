"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Music, Save, Check } from "lucide-react";
import { setRepoGenresAction } from "@/actions/genres";
import type { Genre, GenreRef } from "@/lib/types/api";

interface GenreEditorProps {
  owner: string;
  repo: string;
  allGenres: Genre[];
  currentGenres: GenreRef[];
}

/**
 * GenreEditor — toggle-chip genre selector for repo settings.
 * Allows selecting/deselecting genres and saving changes.
 */
export default function GenreEditor({
  owner,
  repo,
  allGenres,
  currentGenres,
}: GenreEditorProps) {
  const currentIds = new Set(currentGenres.map((g) => g.genre_id));
  const [selected, setSelected] = useState<Set<number>>(currentIds);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const router = useRouter();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFeedback(null);
  }

  const hasChanges = (() => {
    if (selected.size !== currentIds.size) return true;
    for (const id of selected) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  })();

  function handleSave() {
    startTransition(async () => {
      const ids = Array.from(selected).map(String);
      const result = await setRepoGenresAction(owner, repo, ids);
      if (result.success) {
        setFeedback({ type: "success", msg: "Genres updated" });
        router.refresh();
      } else {
        setFeedback({ type: "error", msg: result.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-soft-white">
        <Music size={14} className="text-muted" />
        Genres
      </label>

      {/* Genre toggle chips */}
      <div className="flex flex-wrap gap-2">
        {allGenres.map((g) => {
          const isActive = selected.has(g.genre_id);
          return (
            <button
              key={g.genre_id}
              type="button"
              onClick={() => toggle(g.genre_id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-150 ${
                isActive
                  ? "border-glass-blue-500/50 bg-glass-blue-500/15 text-glass-cyan-500"
                  : "border-white/10 bg-charcoal text-muted hover:border-white/20 hover:text-soft-white"
              }`}
            >
              {isActive && <Check size={12} />}
              {g.genre_name}
            </button>
          );
        })}
        {allGenres.length === 0 && (
          <p className="text-sm text-muted">No genres available.</p>
        )}
      </div>

      {/* Save button + feedback */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !hasChanges}
          className="flex items-center gap-2 rounded-md bg-glass-blue px-5 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-glass-highlight disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={14} />
          {isPending ? "Saving…" : "Save Genres"}
        </button>

        {feedback && (
          <span
            className={`text-sm ${
              feedback.type === "success" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}
