// Runs inside the Libby site (every frame, via nodeIntegrationInSubFrames).
// Observes the page's <audio> element + navigator.mediaSession and pushes
// NowPlayingState to main; executes transport commands sent by main.
//
// NOTE: sandboxed preloads can only require Electron/Node built-ins — no
// relative modules — so IPC channel names are literals here (mirrors of
// IPC.* in src/shared/types.ts) and shared types are import-type only.

import { ipcRenderer } from 'electron';
import type { ControlMessage, NowPlayingState } from '../shared/types';

const POLL_MS = 500;
/** Re-send unchanged state at least this often, as a liveness heartbeat —
 *  main clears the strip when pushes stop (player closed, frame gone). */
const HEARTBEAT_MS = 2000;

const findAudio = (): HTMLAudioElement | null => document.querySelector('audio');

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
/** Whether this frame had an <audio> on the previous tick. */
let hadAudio = false;

function tick(): void {
  const audio = findAudio();
  if (!audio) {
    hadAudio = false; // some other frame owns the player (or none does)
    return;
  }
  // When the player (re)appears, main may have already reset its cache to the
  // empty state (stale timeout after the previous player closed). Force a full
  // fresh push — including artwork — so a reopened book doesn't show blank art
  // just because its artwork URL happens to be unchanged.
  if (!hadAudio) {
    sentArtworkSrc = null;
    lastSentJson = '';
  }
  hadAudio = true;

  const meta = navigator.mediaSession?.metadata ?? null;

  // Only include artworkUrl when it changed — data: URLs are large and state
  // is pushed twice a second while playing. Main keeps the cached value when
  // the field is omitted.
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
    hasAudio: true,
    title: meta?.title ?? '',
    artist: meta?.artist ?? '',
    album: meta?.album ?? '',
    currentTime: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    paused: audio.paused,
  };
  if (artworkUrl !== undefined) state.artworkUrl = artworkUrl;

  const json = JSON.stringify(state);
  const now = Date.now();
  if (json === lastSentJson && now - lastSentAt < HEARTBEAT_MS) return;
  lastSentJson = json;
  lastSentAt = now;
  ipcRenderer.send('np:state', state);
}

setInterval(tick, POLL_MS);

// --- transport commands ----------------------------------------------------

const SKIP_SECONDS = 15;

ipcRenderer.on('np:control', (_event, msg: ControlMessage) => {
  const audio = findAudio();
  if (!audio) return; // command is for whichever frame owns the audio

  const clamp = (t: number) => {
    const lo = Math.max(0, t);
    return Number.isFinite(audio.duration) ? Math.min(lo, audio.duration) : lo;
  };

  switch (msg.action) {
    case 'playpause':
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
      break;
    case 'forward':
      audio.currentTime = clamp(audio.currentTime + SKIP_SECONDS);
      break;
    case 'back':
      audio.currentTime = clamp(audio.currentTime - SKIP_SECONDS);
      break;
    case 'seek':
      if (typeof msg.value === 'number' && Number.isFinite(audio.duration)) {
        audio.currentTime = clamp(msg.value * audio.duration);
      }
      break;
  }
});
