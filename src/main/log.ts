// File logging for the packaged (LSUIElement) app, which has no attached
// terminal — console output goes nowhere discoverable. Writes to
// ~/Library/Logs/LibbyBar/main.log so a misbehaving tray app leaves a trail.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

let logPath = '';

function write(line: string): void {
  try {
    if (!logPath) logPath = path.join(app.getPath('logs'), 'main.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging must never throw into a caller; drop on failure.
  }
}

export function log(message: string): void {
  write(message);
}

export function logError(scope: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  write(`[${scope}] ${detail}`);
}

/** Backstop so an unexpected throw is recorded rather than silently killing
 *  the tray app. Root causes are fixed at the source; this is the safety net. */
export function installErrorLogging(): void {
  process.on('uncaughtException', (err) => logError('uncaughtException', err));
  process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason));
}
