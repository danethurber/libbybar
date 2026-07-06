// Preload for the read-only now-playing strip: a minimal contextBridge API.
// (Channel name is a literal — sandboxed preloads can't require relative
// modules; it mirrors IPC.state in src/shared/types.ts.)

import { contextBridge, ipcRenderer } from 'electron';
import type { NowPlayingState } from '../shared/types';

export interface LibbyBarApi {
  onNowPlaying(callback: (state: NowPlayingState) => void): void;
}

const api: LibbyBarApi = {
  onNowPlaying(callback) {
    ipcRenderer.on('np:state', (_event, state: NowPlayingState) => callback(state));
  },
};

contextBridge.exposeInMainWorld('libbybar', api);
