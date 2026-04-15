export class AudioSnippetsManager {
  static audio: HTMLAudioElement | null = typeof window !== "undefined" ? new Audio() : null;
  static currentSrc: string | null = null;
  static isMuted = false;
  static listeners = new Set<() => void>();

  static subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  static notify() {
    this.listeners.forEach((cb) => cb());
  }

  static play(src: string) {
    if (!this.audio) return;
    if (this.currentSrc !== src) {
      this.audio.src = src;
      this.currentSrc = src;
      this.audio.currentTime = 0;
    }
    this.audio.muted = this.isMuted;
    this.audio.play();
    this.notify();
  }

  static pause() {
    if (!this.audio) return;
    this.audio.pause();
    this.notify();
  }

  static toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) this.audio.muted = this.isMuted;
    this.notify();
  }

  static isPlaying(src: string) {
    return this.currentSrc === src && this.audio && !this.audio.paused;
  }
}

if (typeof window !== "undefined" && AudioSnippetsManager.audio) {
  const events = ["play", "pause", "ended", "timeupdate", "volumechange"];
  events.forEach((e) =>
    AudioSnippetsManager.audio!.addEventListener(e, () => AudioSnippetsManager.notify())
  );
}
