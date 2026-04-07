"use client";

import AudioPlayer from "@/components/AudioPlayer";

interface ProfileSnippetPlayerProps {
  src: string;
}

export default function ProfileSnippetPlayer({ src }: ProfileSnippetPlayerProps) {
  return <AudioPlayer src={src} compact />;
}
