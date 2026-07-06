// Types shared between the main process, the Libby preload, and the strip
// renderer. The strip is a read-only now-playing display driven entirely by
// navigator.mediaSession — Libby plays through a detached audio element we
// can't reach, but it does populate Media Session, which is also what feeds
// macOS Now Playing and the media keys. There are no transport controls: the
// embedded Libby player handles interaction.

export interface NowPlayingState {
  hasMedia: boolean;
  title: string;
  /** Libby puts the author / narrator here. */
  artist: string;
  /** Libby puts the chapter / album here. */
  album: string;
  /**
   * https: or data: URL for the cover. Omitted (undefined) in pushes where
   * the artwork has not changed since the last push — the main process keeps
   * the previous value. Empty string means "no artwork".
   */
  artworkUrl?: string;
  /** From navigator.mediaSession.playbackState === 'playing'. */
  playing: boolean;
}

export const EMPTY_STATE: NowPlayingState = {
  hasMedia: false,
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  playing: false,
};

/** IPC channel names, in one place so main/preloads can't drift apart.
 *  (The sandboxed preloads can't import these at runtime, so they repeat the
 *  literals — test/ipc-channels.test.js enforces that they stay in sync.) */
export const IPC = {
  /** NowPlayingState push. Bidirectional on purpose: Libby preload -> main,
   *  and main -> strip renderer (two different WebContents, same channel). */
  state: 'np:state',
} as const;

/** Loopback HTTP server for Raycast (read-only now-playing status). */
export const HTTP_PORT = 48151;
/** Requests must carry this header — forces a CORS preflight that fails for web pages. */
export const HTTP_GUARD_HEADER = 'x-libbybar';
