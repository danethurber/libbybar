// Preload for the now-playing strip renderer: a minimal contextBridge API.
// (Channel names are literals — sandboxed preloads can't require relative
// modules; they mirror IPC.* in src/shared/types.ts.)

import { contextBridge, ipcRenderer } from 'electron';
import type { ControlMessage, NowPlayingState } from '../shared/types';

export interface LibbyBarApi {
  onNowPlaying(callback: (state: NowPlayingState) => void): void;
  control(msg: ControlMessage): Promise<void>;
}

const api: LibbyBarApi = {
  onNowPlaying(callback) {
    ipcRenderer.on('np:state', (_event, state: NowPlayingState) => callback(state));
  },
  control(msg) {
    return ipcRenderer.invoke('np:control-request', msg);
  },
};

contextBridge.exposeInMainWorld('libbybar', api);
