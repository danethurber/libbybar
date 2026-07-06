// LibbyBar — tray-only macOS menu bar app wrapping the Libby web player.

import { app } from 'electron';
import { createPopover } from './popover';
import { createTray } from './tray';
import { createNowPlayingRelay } from './now-playing';
import { startHttpServer } from './http-server';

// Tray-only: never in the Dock or app switcher. (The packaged app also sets
// LSUIElement=true in Info.plist; dock.hide() covers `npm start` dev runs.)
app.dock?.hide();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    app.setActivationPolicy('accessory');

    const popover = createPopover();
    createTray((trayBounds) => popover.toggle(trayBounds));

    const relay = createNowPlayingRelay(
      popover.libbyView.webContents,
      popover.window.webContents,
    );
    startHttpServer(relay);
  });

  // Tray app: the popover hides rather than closes, but never quit on
  // window-all-closed either (quit lives in the tray menu).
  app.on('window-all-closed', () => {
    /* keep running */
  });
}
