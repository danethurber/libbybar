// Relay between the Libby preload observer and the strip renderer, plus the
// state cache served by the HTTP /status endpoint. Read-only: the strip is a
// now-playing display, so there is no control path back to the page.

import { ipcMain, type WebContents } from 'electron';
import { EMPTY_STATE, IPC, type NowPlayingState } from '../shared/types';

/** Consider playback gone if the preload stops pushing for this long.
 *  (The preload heartbeats every ~2s even when unchanged.) */
const STALE_MS = 6000;

export interface NowPlayingRelay {
  getState(): NowPlayingState;
  dispose(): void;
}

export function createNowPlayingRelay(
  libbyWC: WebContents,
  stripWC: WebContents,
): NowPlayingRelay {
  let state: NowPlayingState = { ...EMPTY_STATE };
  let lastPushAt = 0;

  const pushToStrip = () => {
    if (!stripWC.isDestroyed()) stripWC.send(IPC.state, state);
  };

  const reset = () => {
    if (!state.hasMedia) return;
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

  // Book closed / frame gone → pushes stop → clear the strip.
  const staleTimer = setInterval(() => {
    if (state.hasMedia && Date.now() - lastPushAt > STALE_MS) reset();
  }, 2000);

  // Full navigations tear the player down immediately.
  libbyWC.on('did-navigate', reset);
  libbyWC.on('render-process-gone', reset);

  // Re-sync the strip whenever its renderer (re)loads.
  stripWC.on('did-finish-load', pushToStrip);

  return {
    getState: () => state,
    dispose: () => {
      clearInterval(staleTimer);
      ipcMain.removeAllListeners(IPC.state);
    },
  };
}
