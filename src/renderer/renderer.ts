// Strip UI logic. Deliberately a *script*, not a module: any import (even
// type-only) makes tsc emit a CommonJS __esModule marker that throws in a
// plain <script>. The two interfaces below mirror src/shared/types.ts and
// src/preload/strip-preload.ts.

interface NowPlayingState {
  hasAudio: boolean;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
}

interface LibbyBarApi {
  onNowPlaying(callback: (state: NowPlayingState) => void): void;
  control(msg: {
    action: 'playpause' | 'forward' | 'back' | 'seek';
    value?: number;
  }): Promise<void>;
}

interface Window {
  libbybar: LibbyBarApi;
}

(() => {
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el as T;
  };

  const emptyState = $('empty-state');
  const nowPlaying = $('now-playing');
  const artwork = $<HTMLImageElement>('artwork');
  const title = $('title');
  const subtitle = $('subtitle');
  const timeElapsed = $('time-elapsed');
  const timeTotal = $('time-total');
  const progressTrack = $('progress-track');
  const progressFill = $('progress-fill');
  const btnBack = $('btn-back');
  const btnPlayPause = $('btn-playpause');
  const btnForward = $('btn-forward');
  const iconPlay = $('icon-play');
  const iconPause = $('icon-pause');

  const libbybar = (window as unknown as Window).libbybar;

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
  }

  // After a user seek, ignore incoming progress for a beat so the bar doesn't
  // jump back while the (500ms-cadence) state catches up.
  let suppressProgressUntil = 0;

  function render(state: NowPlayingState): void {
    const active = state.hasAudio;
    emptyState.hidden = active;
    nowPlaying.hidden = !active;
    if (!active) return;

    title.textContent = state.title || 'Audiobook';
    subtitle.textContent = [state.artist, state.album].filter(Boolean).join(' — ');

    const src = state.artworkUrl ?? '';
    if (artwork.getAttribute('src') !== src) artwork.setAttribute('src', src);

    iconPlay.hidden = !state.paused;
    iconPause.hidden = state.paused;

    if (Date.now() >= suppressProgressUntil) {
      const fraction = state.duration > 0 ? state.currentTime / state.duration : 0;
      progressFill.style.width = `${(fraction * 100).toFixed(2)}%`;
      timeElapsed.textContent = formatTime(state.currentTime);
      timeTotal.textContent = formatTime(state.duration);
    }
  }

  libbybar.onNowPlaying(render);

  btnPlayPause.addEventListener('click', () => void libbybar.control({ action: 'playpause' }));
  btnBack.addEventListener('click', () => void libbybar.control({ action: 'back' }));
  btnForward.addEventListener('click', () => void libbybar.control({ action: 'forward' }));

  progressTrack.addEventListener('click', (event) => {
    const rect = progressTrack.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    progressFill.style.width = `${(fraction * 100).toFixed(2)}%`;
    suppressProgressUntil = Date.now() + 1200;
    void libbybar.control({ action: 'seek', value: fraction });
  });
})();
