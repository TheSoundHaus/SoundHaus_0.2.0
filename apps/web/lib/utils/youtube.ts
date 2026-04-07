/** Parse a YouTube watch / youtu.be / embed URL → 11-char video id. */
export function extractYouTubeVideoId(url: string): string | null {
    const m = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    );
    return m ? (m[1] ?? null) : null;
}

export function youtubeThumbnailHq(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeNoCookieEmbedUrl(videoId: string, autoplayMuted = false): string {
    const base = `https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1`;
    return autoplayMuted
        ? `${base}&autoplay=1&mute=1&controls=0`
        : `${base}&controls=1`;
}
