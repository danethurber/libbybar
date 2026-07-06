// Types shared between the main process, preloads, and the strip renderer.

export type ControlAction = 'playpause' | 'forward' | 'back' | 'seek';

export interface ControlMessage {
  action: ControlAction;
  /** For 'seek': target position as a fraction of duration (0..1). */
  value?: number;
}

export interface NowPlayingState {
  hasAudio: boolean;
  title: string;
  /** Libby puts the author / chapter info in mediaSession artist/album. */
  artist: string;
  album: string;
  /**
   * https: or data: URL for the cover. Omitted (undefined) in pushes where
   * the artwork has not changed since the last push — the main process keeps
   * the previous value. Empty string means "no artwork".
   */
  artworkUrl?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
}

export const EMPTY_STATE: NowPlayingState = {
  hasAudio: false,
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  currentTime: 0,
  duration: 0,
  paused: true,
};

/** IPC channel names, in one place so main/preloads can't drift apart.
 *  (The sandboxed preloads can't import these at runtime, so they repeat the
 *  literals — test/ipc-channels.test.js enforces that they stay in sync.) */
export const IPC = {
  /** NowPlayingState push. Bidirectional on purpose: Libby preload -> main,
   *  and main -> strip renderer (two different WebContents, same channel). */
  state: 'np:state',
  /** main -> Libby preload: ControlMessage. */
  control: 'np:control',
  /** strip renderer -> main: ControlMessage (invoke). */
  controlRequest: 'np:control-request',
} as const;

/** Loopback HTTP server for Raycast. */
export const HTTP_PORT = 48151;
/** Requests must carry this header — forces a CORS preflight that fails for web pages. */
export const HTTP_GUARD_HEADER = 'x-libbybar';
