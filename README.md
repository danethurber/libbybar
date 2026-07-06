# LibbyBar

A macOS menu bar app for [Libby](https://libbyapp.com) audiobooks. It wraps the
Libby web player in a tray popover and adds a Spotify-style now-playing strip
on top: cover art, title and chapter, a scrub bar, and play/pause / ±15s
controls — plus macOS Now Playing, media key support, and a local HTTP API for
[Raycast](https://raycast.com).

- **Tray-only** — lives in the menu bar, never in the Dock or app switcher
- **Your library login persists** across launches
- **Controls the real player** — buttons drive the page's `<audio>` element
  directly, so position sync with your other Libby devices keeps working
- **macOS Now Playing + hardware media keys** work out of the box
- Apple Silicon only

## Install

Download the latest `.dmg` from
[**Releases**](https://github.com/danethurber/libbybar/releases/latest), open
it, and drag **LibbyBar** to Applications.

> **Gatekeeper note:** builds are ad-hoc signed, not notarized (no Apple
> Developer certificate). On first launch macOS shows a warning that it can't
> verify the app. Close the warning, open **System Settings → Privacy &
> Security**, scroll down, and click **Open Anyway** (on macOS 14 and
> earlier, right-click → **Open** also works). Alternatively, clear the
> quarantine flag from a terminal and it opens with no fuss:
>
> ```sh
> xattr -dr com.apple.quarantine /Applications/LibbyBar.app
> ```

### First launch

Click the headphones icon in the menu bar and sign into your library inside
the popover. Login popups are expected — libraries authenticate through their
own identity pages. This is one-time; the session persists.

## Usage

- **Left-click** the tray icon: toggle the popover (it hides when it loses
  focus; audio keeps playing).
- **Right-click** the tray icon: menu with Quit.
- Start an audiobook and the strip shows what's playing. macOS **Now Playing**
  and keyboard **media keys** work through Chromium's Media Session bridge.

## Raycast

Add the `raycast/` folder as a script directory (Raycast Settings →
Extensions → Script Commands → Add Directories). You get **Libby
Play/Pause**, **Libby Skip Forward 15s**, and **Libby Skip Back 15s**.

The scripts call a loopback-only API on port `48151`:

```sh
curl -H "X-LibbyBar: 1" http://127.0.0.1:48151/status      # now-playing JSON
curl -H "X-LibbyBar: 1" http://127.0.0.1:48151/playpause
curl -H "X-LibbyBar: 1" http://127.0.0.1:48151/forward
curl -H "X-LibbyBar: 1" http://127.0.0.1:48151/back
```

The `X-LibbyBar` header is required: custom headers force a CORS preflight,
which fails, so a random web page can't fire requests at the API. Anything
that can set a header (curl, Raycast, Shortcuts, Keyboard Maestro) can use it.

## Building from source

```sh
git clone https://github.com/danethurber/libbybar.git
cd libbybar
npm install
npm start          # compile (tsc) and run in dev mode
npm test           # build + node:test suite
npm run dist       # package an arm64 .dmg into release/
```

Runtime problems are logged to `~/Library/Logs/LibbyBar/main.log` (the
packaged tray app has no console).

### Architecture

TypeScript everywhere, no framework, no native code:

- The popover window's own renderer is the now-playing strip; the Libby site
  lives in a `WebContentsView` positioned below it (`persist:libby` session).
- A preload inside the Libby view observes the `<audio>` element and
  `navigator.mediaSession` (in every frame) and pushes state to the main
  process, which relays it to the strip and serves `/status`.
- Transport commands flow the reverse path and drive the `<audio>` element
  directly — never Libby's DOM buttons, so UI changes on their end are less
  likely to break controls.
- `npm run icons` regenerates the tray template icons from
  `assets/gen-tray-icon.ts` (dependency-free PNG encoder).

## Releases

CI runs on every pull request, and on pushes to `main` via the release
workflow (`.github/workflows/ci.yml`). Releases are cut automatically by
[semantic-release](https://github.com/semantic-release/semantic-release)
on pushes to `main`: commit messages follow
[Conventional Commits](https://www.conventionalcommits.org) (`feat:` → minor,
`fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major), and each release gets
the packaged `.dmg` attached.

## License

[MIT](LICENSE)
