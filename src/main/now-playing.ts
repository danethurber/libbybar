// Relay between the Libby preload observer and the strip renderer, plus the
// state cache served by the HTTP /status endpoint.

import { ipcMain, WebContents } from 'electron';
import { ControlMessage, EMPTY_STATE, IPC, NowPlayingState } from '../shared/types';

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

  const pushToStrip = () => {
    if (!stripWC.isDestroyed()) stripWC.send(IPC.stateToStrip, state);
  };

  const reset = () => {
    if (!state.hasAudio) return;
    state = { ...EMPTY_STATE };
    pushToStrip();
  };

  ipcMain.on(IPC.state, (event, incoming: NowPlayingState) => {
    if (event.sender !== libbyWC) return;
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
    if (!libbyWC.isDestroyed()) libbyWC.send(IPC.control, msg);
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
