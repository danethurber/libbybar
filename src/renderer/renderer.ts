// Read-only strip UI. Deliberately a *script*, not a module — it's loaded via
// a plain <script> tag, so it must not emit CommonJS/ESM module machinery.
// Kept a script by having no imports/exports; the shared shapes it needs are
// ambient (see types.d.ts). (The real blocker to importing here is the
// renderer's rootDir, not type-only imports, which erase cleanly.)

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
  const stateDot = $('state-dot');

  const libbybar = window.libbybar;

  function render(state: NowPlayingState): void {
    const active = state.hasMedia;
    emptyState.hidden = active;
    nowPlaying.hidden = !active;
    if (!active) return;

    title.textContent = state.title || 'Audiobook';
    subtitle.textContent = [state.artist, state.album].filter(Boolean).join(' — ');

    const src = state.artworkUrl ?? '';
    if (artwork.getAttribute('src') !== src) artwork.setAttribute('src', src);

    stateDot.classList.toggle('playing', state.playing);
    stateDot.title = state.playing ? 'Playing' : 'Paused';
  }

  libbybar.onNowPlaying(render);
})();
