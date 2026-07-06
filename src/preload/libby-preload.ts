// Runs inside the Libby site (every frame, via nodeIntegrationInSubFrames).
// Observes navigator.mediaSession and pushes NowPlayingState to main for the
// read-only strip. Libby plays audio through a detached element we can't
// query, so we rely on Media Session metadata — the same data that drives
// macOS Now Playing. There are no transport controls: Libby's own player UI
// handles interaction, so this preload never touches playback.
//
// NOTE: sandboxed preloads can only require Electron/Node built-ins — no
// relative modules — so the IPC channel name is a literal here (mirror of
// IPC.state in src/shared/types.ts) and shared types are import-type only.

import { ipcRenderer } from 'electron';
import type { NowPlayingState } from '../shared/types';

const POLL_MS = 500;
/** Re-send unchanged state at least this often, as a liveness heartbeat —
 *  main clears the strip when pushes stop (book closed, frame gone). */
const HEARTBEAT_MS = 2000;

// --- artwork ---------------------------------------------------------------

// mediaSession artwork may be a blob: URL, which only this renderer can
// resolve — convert to a data: URL before shipping over IPC. Converted once
// per source URL.
let converted: { src: string; dataUrl: string } | null = null;
let converting = false;

function pickArtworkSrc(meta: MediaMetadata | null): string {
  if (!meta || meta.artwork.length === 0) return '';
  let best: MediaImage | undefined;
  let bestArea = -1;
  for (const img of meta.artwork) {
    // sizes is like "300x300"; unparseable/absent sorts smallest.
    const m = /^(\d+)x(\d+)/.exec(img.sizes ?? '');
    const area = m ? Number(m[1]) * Number(m[2]) : 0;
    if (area > bestArea) {
      bestArea = area;
      best = img;
    }
  }
  if (!best) return '';
  try {
    return new URL(best.src, location.href).href;
  } catch {
    return '';
  }
}

async function convertBlobArtwork(src: string): Promise<void> {
  if (converting) return;
  converting = true;
  try {
    const blob = await (await fetch(src)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    converted = { src, dataUrl };
  } catch {
    converted = { src, dataUrl: '' }; // don't retry a broken blob forever
  } finally {
    converting = false;
  }
}

// --- state pushes ----------------------------------------------------------

let lastSentJson = '';
let lastSentAt = 0;
/** Source URL of the artwork the main process currently has. */
let sentArtworkSrc: string | null = null;
/** Whether this frame reported media on the previous tick. */
let hadMedia = false;

function tick(): void {
  const session = navigator.mediaSession ?? null;
  const meta = session?.metadata ?? null;

  if (!meta) {
    // This frame has no now-playing metadata. If it was reporting until now
    // (book closed), push one empty state so the strip clears; otherwise stay
    // silent so we don't clobber the frame that actually owns the session.
    if (hadMedia) {
      hadMedia = false;
      sentArtworkSrc = null;
      lastSentJson = '';
      ipcRenderer.send('np:state', { ...EMPTY });
    }
    return;
  }

  // Media (re)appeared: force a fresh full push including artwork, in case
  // main already reset its cache after the previous book closed.
  if (!hadMedia) {
    sentArtworkSrc = null;
    lastSentJson = '';
  }
  hadMedia = true;

  // Only include artworkUrl when it changed — data: URLs are large and state
  // is pushed frequently. Main keeps the cached value when the field is omitted.
  const artworkSrc = pickArtworkSrc(meta);
  let artworkUrl: string | undefined;
  if (artworkSrc !== sentArtworkSrc) {
    if (!artworkSrc.startsWith('blob:')) {
      artworkUrl = artworkSrc;
      sentArtworkSrc = artworkSrc;
    } else if (converted?.src === artworkSrc) {
      artworkUrl = converted.dataUrl;
      sentArtworkSrc = artworkSrc;
    } else {
      void convertBlobArtwork(artworkSrc); // ships on a later tick
    }
  }

  const state: NowPlayingState = {
    hasMedia: true,
    title: meta.title ?? '',
    artist: meta.artist ?? '',
    album: meta.album ?? '',
    playing: session?.playbackState === 'playing',
  };
  if (artworkUrl !== undefined) state.artworkUrl = artworkUrl;

  const json = JSON.stringify(state);
  const now = Date.now();
  if (json === lastSentJson && now - lastSentAt < HEARTBEAT_MS) return;
  lastSentJson = json;
  lastSentAt = now;
  ipcRenderer.send('np:state', state);
}

const EMPTY: NowPlayingState = {
  hasMedia: false,
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  playing: false,
};

setInterval(tick, POLL_MS);
