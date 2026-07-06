# LibbyBar

A macOS menu bar app for [Libby](https://libbyapp.com) audiobooks. It wraps the
Libby web player in a tray popover with a compact now-playing strip on top —
cover art, title, and chapter — plus macOS Now Playing, media key support, and
a local HTTP API for [Raycast](https://raycast.com).

- **Tray-only** — lives in the menu bar, never in the Dock or app switcher
- **Your library login persists** across launches
- **Now-playing strip** — a read-only display driven by the page's Media
  Session; playback controls are Libby's own, right below it
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
- Start an audiobook and the strip shows what's playing; use Libby's own
  player controls below it. macOS **Now Playing** and keyboard **media keys**
  work through Chromium's Media Session bridge — so play/pause and skip from
  the keyboard work without any extra setup.

> Playback control is intentionally left to Libby's player and the system
> media keys: Libby plays through an audio element the app can't reach, so a
> custom scrub bar / transport buttons couldn't reliably drive it. The strip
> is a read-only now-playing display.

## Raycast

Add the `raycast/` folder as a script directory (Raycast Settings →
Extensions → Script Commands → Add Directories) for the **Libby Now Playing**
command, which shows the current book.

It reads a loopback-only status API on port `48151`:

```sh
curl -H "X-LibbyBar: 1" http://127.0.0.1:48151/status      # now-playing JSON
```

The `X-LibbyBar` header is required: custom headers force a CORS preflight,
which fails, so a random web page can't read your now-playing info. Anything
that can set a header (curl, Raycast, Shortcuts) can use it.

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

- The popover window's own renderer is the read-only now-playing strip; the
  Libby site lives in a `WebContentsView` positioned below it (`persist:libby`
  session).
- A preload inside the Libby view observes `navigator.mediaSession` (in every
  frame) and pushes state one-way to the main process, which relays it to the
  strip and serves `/status`. There is no control path back — Libby's own
  player handles interaction.
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
