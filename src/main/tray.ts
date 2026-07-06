// Menu bar tray icon. Left-click toggles the popover; right-click shows a
// context menu (a tray-only app has no other way to quit).

import { app, Menu, nativeImage, Tray } from 'electron';
import * as path from 'node:path';

export function createTray(onToggle: (trayBounds: Electron.Rectangle) => void): Tray {
  // The "Template" filename suffix marks this a template image: pure
  // black + alpha, recolored by macOS for light/dark menu bars. The @2x
  // variant next to it is picked up automatically.
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/trayTemplate.png'),
  );
  const tray = new Tray(icon);
  tray.setToolTip('LibbyBar');
  tray.setIgnoreDoubleClickEvents(true);

  const menu = Menu.buildFromTemplate([
    { label: 'Show/Hide LibbyBar', click: () => onToggle(tray.getBounds()) },
    { type: 'separator' },
    { label: 'Quit LibbyBar', click: () => app.quit() },
  ]);

  tray.on('click', () => onToggle(tray.getBounds()));
  // Deliberately not tray.setContextMenu(): on macOS that hijacks left-click too.
  tray.on('right-click', () => tray.popUpContextMenu(menu));

  return tray;
}
