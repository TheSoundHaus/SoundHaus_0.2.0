import type { Genre } from "../../models/repo"

interface GenreTagsProps {
  genres: Genre[]
  onSelectGenre?: (genre: string) => void
}

export default function GenreTags({ genres, onSelectGenre }: GenreTagsProps){
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {genres.map((genre) => (
        <span
          key={genre.genre_id}
          onClick={() => onSelectGenre?.(genre.genre_name)}
          style={{
            padding: "2px 8px",
            background: "#f0f0f0",
            borderRadius: 12,
            fontSize: 13,
            color: "#666",
            cursor: onSelectGenre ? "pointer" : "default",
          }}
        >
          {genre.genre_name}
        </span>
      ))}
    </div>
  )
}