'use strict';
// Covers the loopback API's guard rails: the DNS-rebind Host check, the
// custom-header requirement, method/route handling, and that a malformed
// request-target returns 400 instead of crashing the process.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');

const { startHttpServer } = require('../dist/main/http-server.js');
const { HTTP_PORT } = require('../dist/shared/types.js');

function request(options) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: HTTP_PORT, ...options }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// Send a raw, deliberately malformed request line the URL parser chokes on.
function rawRequest(line) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(HTTP_PORT, '127.0.0.1', () => socket.write(line));
    let buf = '';
    socket.on('data', (chunk) => (buf += chunk));
    socket.on('end', () => resolve(buf));
    socket.on('error', reject);
    setTimeout(() => {
      socket.end();
      resolve(buf);
    }, 500);
  });
}

test('loopback HTTP API', async (t) => {
  const server = startHttpServer({
    getState: () => ({ hasMedia: false, title: 'x' }),
  });
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());

  await t.test('missing guard header -> 403', async () => {
    const res = await request({ path: '/status' });
    assert.equal(res.status, 403);
  });

  await t.test('spoofed Host -> 403 (DNS-rebind defense)', async () => {
    const res = await request({ path: '/status', headers: { host: 'evil.com:' + HTTP_PORT, 'x-libbybar': '1' } });
    assert.equal(res.status, 403);
  });

  await t.test('non-GET -> 405', async () => {
    const res = await request({ path: '/status', method: 'POST', headers: { 'x-libbybar': '1' } });
    assert.equal(res.status, 405);
  });

  await t.test('/status -> 200 with state JSON', async () => {
    const res = await request({ path: '/status', headers: { 'x-libbybar': '1' } });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).hasMedia, false);
  });

  await t.test('removed control endpoint -> 404', async () => {
    const res = await request({ path: '/playpause', headers: { 'x-libbybar': '1' } });
    assert.equal(res.status, 404);
  });

  await t.test('unknown route -> 404', async () => {
    const res = await request({ path: '/nope', headers: { 'x-libbybar': '1' } });
    assert.equal(res.status, 404);
  });

  await t.test('malformed request target -> 400, server stays up', async () => {
    const raw = await rawRequest(`GET //[ HTTP/1.1\r\nHost: 127.0.0.1:${HTTP_PORT}\r\nx-libbybar: 1\r\n\r\n`);
    assert.match(raw, /^HTTP\/1\.1 400/);
    // Still serving afterward.
    const res = await request({ path: '/status', headers: { 'x-libbybar': '1' } });
    assert.equal(res.status, 200);
  });
});
