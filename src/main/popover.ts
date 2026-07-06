// The tray popover: a frameless BrowserWindow whose own webContents renders
// the now-playing strip, with a WebContentsView (the Libby site) mounted
// below it. Main owns both webContents directly — no <webview> tag.

import { BrowserWindow, WebContentsView, screen, session } from 'electron';
import * as path from 'node:path';
import { logError } from './log';

export const POPOVER_WIDTH = 380;
export const POPOVER_HEIGHT = 600;
export const STRIP_HEIGHT = 76;

const LIBBY_URL = 'https://libbyapp.com';
const LIBBY_PARTITION = 'persist:libby';

export interface Popover {
  window: BrowserWindow;
  libbyView: WebContentsView;
  /** Toggle visibility, positioning under the given tray bounds. */
  toggle(trayBounds: Electron.Rectangle): void;
}

export function createPopover(): Popover {
  const libbySession = session.fromPartition(LIBBY_PARTITION);
  // Nothing Libby needs (audio playback is permissionless); deny mic, camera,
  // notifications, geolocation, etc.
  libbySession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const window = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/strip-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Show over full-screen apps, like a real menu bar popover.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, 'pop-up-menu');

  // The strip window holds the privileged libbybar bridge — it must never
  // navigate to or open remote content that could inherit it.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void window.loadFile(path.join(__dirname, '../renderer/index.html'));

  const libbyView = new WebContentsView({
    webPreferences: {
      partition: LIBBY_PARTITION,
      preload: path.join(__dirname, '../preload/libby-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Libby may host the player <audio> in a subframe; run the preload
      // observer in every frame so whichever frame owns it can report.
      nodeIntegrationInSubFrames: true,
    },
  });
  window.contentView.addChildView(libbyView);
  libbyView.setBounds({
    x: 0,
    y: STRIP_HEIGHT,
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT - STRIP_HEIGHT,
  });

  // Some sites refuse "unsupported browsers" based on the Electron/appname UA
  // tokens; present as plain Chrome.
  const ua = libbyView.webContents
    .getUserAgent()
    .replace(/ (Electron|LibbyBar|libbybar)\/[\d.]+/g, '');
  libbyView.webContents.setUserAgent(ua);

  // Keep the in-page observer ticking while the popover is hidden.
  libbyView.webContents.setBackgroundThrottling(false);

  // Retry the initial load if the network is down at launch (login-item start,
  // captive portal, DNS blip) so the popover isn't stuck on an error page.
  let reloadAttempts = 0;
  libbyView.webContents.on('did-finish-load', () => {
    reloadAttempts = 0;
  });
  libbyView.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = user-aborted navigation
    if (reloadAttempts >= 6) return;
    const delay = Math.min(30_000, 1000 * 2 ** reloadAttempts);
    reloadAttempts += 1;
    setTimeout(() => {
      if (!libbyView.webContents.isDestroyed()) {
        void libbyView.webContents.loadURL(LIBBY_URL).catch((err) => logError('libby-reload', err));
      }
    }, delay);
  });

  // Library sign-in (OverDrive / SAML / IdP) opens popup windows; blocking
  // them dead-ends login. Allow http(s) children on the same session, but
  // don't let a login page (which we don't control) spawn further popups.
  libbyView.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:/.test(url)) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 680,
        webPreferences: {
          partition: LIBBY_PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  });
  libbyView.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  void libbyView.webContents.loadURL(LIBBY_URL);

  // --- show/hide -----------------------------------------------------------

  let hiddenAt = 0;
  const hide = () => {
    hiddenAt = Date.now();
    window.hide();
  };
  window.on('blur', hide);

  const toggle = (trayBounds: Electron.Rectangle) => {
    if (window.isVisible()) {
      hide();
      return;
    }
    // Clicking the tray icon while the popover is open blurs (and hides) it
    // *before* the click event arrives; without this guard the same click
    // would immediately re-open it.
    if (Date.now() - hiddenAt < 250) return;

    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = display.workArea;
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - POPOVER_WIDTH / 2);
    x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - POPOVER_WIDTH - 8));
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    window.setPosition(x, y, false);
    window.show();
  };

  return { window, libbyView, toggle };
}
