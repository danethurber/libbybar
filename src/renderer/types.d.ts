// Ambient types for the strip renderer. It compiles as a plain browser script
// (no imports — see renderer.ts), so it can't import the shared types; these
// mirror the relevant shapes in src/shared/types.ts and the API exposed by
// src/preload/strip-preload.ts. A .d.ts never emits, so it stays a script.

interface NowPlayingState {
  hasAudio: boolean;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
}

interface StripControlMessage {
  action: 'playpause' | 'forward' | 'back' | 'seek';
  value?: number;
}

interface LibbyBarApi {
  onNowPlaying(callback: (state: NowPlayingState) => void): void;
  control(msg: StripControlMessage): Promise<void>;
}

interface Window {
  libbybar: LibbyBarApi;
}
