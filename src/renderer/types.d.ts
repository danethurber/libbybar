// Ambient types for the strip renderer. It compiles as a plain browser script
// (no imports — see renderer.ts), so it can't import the shared types; these
// mirror the relevant shapes in src/shared/types.ts and the API exposed by
// src/preload/strip-preload.ts. A .d.ts never emits, so it stays a script.

interface NowPlayingState {
  hasMedia: boolean;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  playing: boolean;
}

interface LibbyBarApi {
  onNowPlaying(callback: (state: NowPlayingState) => void): void;
}

interface Window {
  libbybar: LibbyBarApi;
}
