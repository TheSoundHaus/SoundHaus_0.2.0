import { useRef, useState } from "react"

interface AudioPlayerProps {
  src: string
}

export default function AudioPlayer({ src }: AudioPlayerProps){
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        void audioRef.current.pause()
      } else {
        void audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  return (
    <div style={{ minHeight: 36, display: "flex", alignItems: "center" }}>
      <audio
        ref={audioRef}
        src={src}
        onCanPlay={() => setIsLoading(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        onClick={togglePlay}
        disabled={isLoading}
        style={{
          padding: "4px 12px",
          borderRadius: 4,
          border: "1px solid #ddd",
          background: isPlaying ? "#e0e0e0" : "white",
          cursor: isLoading ? "wait" : "pointer",
        }}
      >
        {isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
      </button>
    </div>
  )
}