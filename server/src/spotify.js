const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const MAX_RETRIES = 5;

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

export const exchangeCode = (code) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: process.env.SPOTIFY_REDIRECT_URI });

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

// GET a Spotify API path for a user: refreshes the token when it's about to expire, waits out 429s.
export async function spotifyGet(user, path) {
  if (!user.refreshToken) throw Object.assign(new Error('Spotify login expired. Log in again.'), { status: 401 });
  if (user.tokenExpiresAt.getTime() - Date.now() < 60_000) await refresh(user);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (res.ok) return res.status === 204 ? null : res.json(); // 204 = nothing (e.g. nothing playing)

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep((Number(res.headers.get('retry-after')) || 1) * 1000);
      continue;
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
