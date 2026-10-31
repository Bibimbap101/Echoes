import { User } from './models/User.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const MAX_RETRIES = 5;
const MAX_WAIT_S = 10; // longer 429 waits (Spotify has sent 15 hours) pause Echoes instead of being slept through
// shortcut: QUOTA_EXCEEDED may come without a usable Retry-After; an hour is a guess. Raise it if blocks keep coming back.
export const LONG_PAUSE_S = 3600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function basicAuth() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const exchangeCode = (code, redirectUri) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

// Applies a token response to a user doc (refresh responses may omit refresh_token).
export function applyTokens(user, t) {
  user.accessToken = t.access_token;
  if (t.refresh_token) user.refreshToken = t.refresh_token;
  user.tokenExpiresAt = new Date(Date.now() + t.expires_in * 1000);
}

async function refresh(user) {
  applyTokens(user, await tokenRequest({ grant_type: 'refresh_token', refresh_token: user.refreshToken }));
  await user.save();
}

// The quota belongs to the whole app (one client ID), so a long block pauses every user. Returns when it ends.
export async function pauseSpotify(seconds) {
  const until = new Date(Date.now() + seconds * 1000);
  await User.updateMany({}, { enrichPausedUntil: until });
  return until;
}

const pausedError = (until) =>
  Object.assign(new Error(`Spotify paused Echoes until ${until.toISOString()}`), { status: 503, spotifyStatus: 429, pausedUntil: until });

// GET a Spotify API path for a user: refreshes the token when it's about to expire, waits out short 429s.
// During a long block it throws without asking Spotify, so nothing keeps knocking on a closed door.
export async function spotifyGet(user, path) {
  if (user.enrichPausedUntil > Date.now()) throw pausedError(user.enrichPausedUntil);
  if (!user.refreshToken) throw Object.assign(new Error('Spotify login expired. Log in again.'), { status: 401 });
  if (user.tokenExpiresAt.getTime() - Date.now() < 60_000) await refresh(user);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (res.ok) return res.status === 204 ? null : res.json(); // 204 = nothing (e.g. nothing playing)

    if (res.status === 429) {
      const body = await res.text();
      const header = res.headers.get('retry-after');
      let wait = header === null ? LONG_PAUSE_S : Number(header);
      if (body.includes('QUOTA_EXCEEDED')) wait = Math.max(wait, LONG_PAUSE_S);
      if (wait <= MAX_WAIT_S && attempt < MAX_RETRIES) {
        await sleep(wait * 1000);
        continue;
      }
      if (wait > MAX_WAIT_S) throw pausedError((user.enrichPausedUntil = await pauseSpotify(wait)));
      throw Object.assign(new Error(`Spotify 429 on ${path}: ${body}`), { status: 502, spotifyStatus: 429 });
    }
    if (res.status === 401 && attempt === 0) {
      await refresh(user); // token revoked or expired early
      continue;
    }
    const err = new Error(`Spotify ${res.status} on ${path}: ${await res.text()}`);
    err.status = res.status === 401 ? 401 : 502;
    err.spotifyStatus = res.status;
    throw err;
  }
}
