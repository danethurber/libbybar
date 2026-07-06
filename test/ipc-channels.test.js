'use strict';
// Enforces the invariant the sandboxed preloads can only document in a comment:
// the channel-name string literals they hard-code must match IPC.* in
// src/shared/types.ts. Without this, a rename in one place silently breaks IPC.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { IPC } = require('../dist/shared/types.js');

const preloadDir = path.join(__dirname, '..', 'src', 'preload');
const combined = ['libby-preload.ts', 'strip-preload.ts']
  .map((f) => fs.readFileSync(path.join(preloadDir, f), 'utf8'))
  .join('\n');

test('every IPC channel value appears as a literal in a preload', () => {
  for (const [name, value] of Object.entries(IPC)) {
    assert.ok(
      combined.includes(`'${value}'`),
      `IPC.${name} ('${value}') is not referenced as a literal in any preload`,
    );
  }
});

test('preloads reference no np: channel that IPC does not define', () => {
  const known = new Set(Object.values(IPC));
  for (const literal of combined.match(/'np:[a-z-]+'/g) ?? []) {
    const channel = literal.slice(1, -1);
    assert.ok(known.has(channel), `preload uses channel '${channel}' not defined in IPC`);
  }
});
