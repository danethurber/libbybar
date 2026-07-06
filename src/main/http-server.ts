// Loopback HTTP API for Raycast script commands.
//
// No auth (loopback only), but every request must carry the X-LibbyBar
// header: browsers force a CORS preflight for custom headers and the
// preflight fails here, so a random web page's fetch() to 127.0.0.1 can
// never trigger the side effects. curl just adds -H.

import * as http from 'node:http';
import { ControlMessage, HTTP_GUARD_HEADER, HTTP_PORT, NowPlayingState } from '../shared/types';

export interface HttpDeps {
  control(msg: ControlMessage): void;
  getState(): NowPlayingState;
}

export function startHttpServer(deps: HttpDeps): http.Server {
  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.headers[HTTP_GUARD_HEADER] === undefined) {
      respond(403, { error: `missing ${HTTP_GUARD_HEADER} header` });
      return;
    }
    if (req.method !== 'GET') {
      respond(405, { error: 'GET only' });
      return;
    }

    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    switch (pathname) {
      case '/playpause':
      case '/forward':
      case '/back':
        deps.control({ action: pathname.slice(1) as ControlMessage['action'] });
        respond(200, { ok: true, state: deps.getState() });
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
    console.error('[libbybar] HTTP server error, Raycast endpoints disabled:', err.message);
  });

  server.listen(HTTP_PORT, '127.0.0.1');
  return server;
}
