import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotifyGet } from './spotify.js';

process.env.SPOTIFY_CLIENT_ID = 'id';
process.env.SPOTIFY_CLIENT_SECRET = 'secret';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

function fakeUser(expiresInMs) {
  return { accessToken: 'old', refreshToken: 'r1', tokenExpiresAt: new Date(Date.now() + expiresInMs), saved: 0, async save() { this.saved++; } };
}

test('refreshes an almost-expired token before calling the API', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(url);
    if (url.includes('/api/token')) return json(200, { access_token: 'new', expires_in: 3600 });
    assert.equal(opts.headers.Authorization, 'Bearer new');
    return json(200, { id: 'me' });
  };
  const user = fakeUser(10_000);
  assert.deepEqual(await spotifyGet(user, '/me'), { id: 'me' });
  assert.equal(user.refreshToken, 'r1'); // kept when Spotify doesn't send a new one
  assert.equal(user.saved, 1);
  assert.equal(calls.length, 2);
});

test('waits out a 429 then succeeds', async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? json(429, {}, { 'Retry-After': '0' }) : json(200, { ok: true }));
  assert.deepEqual(await spotifyGet(fakeUser(3600_000), '/me'), { ok: true });
  assert.equal(n, 2);
});

test('asks Spotify nothing while the app is paused', async () => {
  let n = 0;
  globalThis.fetch = async () => (n++, json(200, {}));
  const user = { ...fakeUser(3600_000), enrichPausedUntil: new Date(Date.now() + 60_000) };
  await assert.rejects(spotifyGet(user, '/me'), { status: 503 });
  assert.equal(n, 0);
});
