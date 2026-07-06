// Relay between the Libby preload observer and the strip renderer, plus the
// state cache served by the HTTP /status endpoint.

import { ipcMain, type WebContents } from 'electron';
import { type ControlMessage, EMPTY_STATE, IPC, type NowPlayingState } from '../shared/types';

/** Consider playback gone if the preload stops pushing for this long.
 *  (The preload heartbeats every ~2s even when paused/unchanged.) */
const STALE_MS = 6000;

export interface NowPlayingRelay {
  getState(): NowPlayingState;
  control(msg: ControlMessage): void;
  dispose(): void;
}

export function createNowPlayingRelay(
  libbyWC: WebContents,
  stripWC: WebContents,
): NowPlayingRelay {
  let state: NowPlayingState = { ...EMPTY_STATE };
  let lastPushAt = 0;
  // The frame that last reported audio. Control commands must target it
  // directly: webContents.send() only reaches the MAIN frame, so if Libby
  // hosts the player <audio> in a subframe, a plain send would silently
  // no-op. Note: with nodeIntegrationInSubFrames every frame shares one
  // WebContents, so the event.sender check authenticates the view, not the
  // frame — the strip and /status therefore treat these strings as untrusted
  // (rendered via textContent, constrained by CSP).
  let audioFrame: Electron.WebFrameMain | null = null;

  const pushToStrip = () => {
    if (!stripWC.isDestroyed()) stripWC.send(IPC.state, state);
  };

  const reset = () => {
    audioFrame = null;
    if (!state.hasAudio) return;
    state = { ...EMPTY_STATE };
    pushToStrip();
  };

  ipcMain.on(IPC.state, (event, incoming: NowPlayingState) => {
    if (event.sender !== libbyWC) return;
    audioFrame = event.senderFrame;
    lastPushAt = Date.now();
    // artworkUrl is omitted from pushes where it hasn't changed (data: URLs
    // can be large); keep the cached value in that case.
    state = { ...incoming, artworkUrl: incoming.artworkUrl ?? state.artworkUrl ?? '' };
    pushToStrip();
  });

  ipcMain.handle(IPC.controlRequest, (event, msg: ControlMessage) => {
    if (event.sender !== stripWC) return;
    control(msg);
  });

  const control = (msg: ControlMessage) => {
    if (libbyWC.isDestroyed()) return;
    // Prefer the audio-owning frame; fall back to broadcasting across the
    // frame tree (only the frame that actually has the <audio> will act).
    try {
      if (audioFrame && audioFrame.isDestroyed() === false) {
        audioFrame.send(IPC.control, msg);
        return;
      }
    } catch {
      /* frame detached between report and command; fall through */
    }
    try {
      for (const frame of libbyWC.mainFrame.framesInSubtree) {
        frame.send(IPC.control, msg);
      }
    } catch {
      /* webContents tearing down */
    }
  };

  // Player closed / frame gone → pushes stop → clear the strip.
  const staleTimer = setInterval(() => {
    if (state.hasAudio && Date.now() - lastPushAt > STALE_MS) reset();
  }, 2000);

  // Full navigations tear the player down immediately.
  libbyWC.on('did-navigate', reset);
  libbyWC.on('render-process-gone', reset);

  // Re-sync the strip whenever its renderer (re)loads.
  stripWC.on('did-finish-load', pushToStrip);

  return {
    getState: () => state,
    control,
    dispose: () => {
      clearInterval(staleTimer);
      ipcMain.removeAllListeners(IPC.state);
      ipcMain.removeHandler(IPC.controlRequest);
    },
  };
}
