// Loopback HTTP API for Raycast script commands.
//
// No auth (loopback only), but every request must carry the X-LibbyBar
// header: browsers force a CORS preflight for custom headers and the
// preflight fails here, so a random web page's fetch() to 127.0.0.1 can
// never trigger the side effects. curl just adds -H.

import * as http from 'node:http';
import {
  type ControlMessage,
  HTTP_GUARD_HEADER,
  HTTP_PORT,
  type NowPlayingState,
} from '../shared/types';
import { logError } from './log';

export interface HttpDeps {
  control(msg: ControlMessage): void;
  getState(): NowPlayingState;
}

// The custom-header guard alone is bypassable by DNS rebinding: an attacker
// page that re-resolves its own hostname to 127.0.0.1 makes requests
// same-origin, so the browser skips the preflight and allows the header. Such
// requests still carry the attacker's Host, so pinning Host to loopback closes
// the hole. Raycast's curl sends Host: 127.0.0.1:PORT and is unaffected.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${HTTP_PORT}`, `localhost:${HTTP_PORT}`]);

export function startHttpServer(deps: HttpDeps): http.Server {
  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (!ALLOWED_HOSTS.has(req.headers.host ?? '')) {
      respond(403, { error: 'bad host' });
      return;
    }
    if (req.headers[HTTP_GUARD_HEADER] === undefined) {
      respond(403, { error: `missing ${HTTP_GUARD_HEADER} header` });
      return;
    }
    if (req.method !== 'GET') {
      respond(405, { error: 'GET only' });
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      // Node passes through malformed request-targets (e.g. `//[`) that make
      // new URL throw; an unhandled throw here would kill the main process.
      respond(400, { error: 'bad request target' });
      return;
    }

    switch (pathname) {
      case '/playpause':
      case '/forward':
      case '/back':
        deps.control({ action: pathname.slice(1) as ControlMessage['action'] });
        // Do not echo getState() here: control is async (main -> preload ->
        // audio -> next poll), so the state wouldn't yet reflect the command.
        // Consumers read /status instead.
        respond(200, { ok: true });
        return;
      case '/status':
        respond(200, deps.getState());
        return;
      default:
        respond(404, { error: 'unknown endpoint' });
    }
  });

  server.on('error', (err) => {
    // Most likely EADDRINUSE (a second instance shouldn't happen — we hold
    // the single-instance lock — but don't crash the app over the port).
    logError('http-server', err);
  });

  server.listen(HTTP_PORT, '127.0.0.1');
  return server;
}
