import { Router } from 'express';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { exchangeCode, applyTokens } from '../spotify.js';
import { pollUser } from '../poller.js';
import { syncLibrary } from '../library.js';

// Read-only. Liked Songs + saved albums, followed artists, playlists, and what's playing now.
const SCOPES = [
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-currently-playing',
].join(' ');
const cookieOpts = { httpOnly: true, sameSite: 'lax', signed: true, secure: Boolean(process.env.VERCEL) }; // https-only when hosted

// Hosted: built from the address people actually opened, so a renamed Vercel domain keeps working
// (it still has to be listed under Redirect URIs in the Spotify dashboard).
export const redirectUri = (req) =>
  process.env.VERCEL ? `https://${req.get('x-forwarded-host') ?? req.get('host')}/api/auth/callback` : process.env.SPOTIFY_REDIRECT_URI;

export const authRouter = Router();

authRouter.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { ...cookieOpts, maxAge: 10 * 60_000 });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(req),
    state,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

authRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const expected = req.signedCookies.oauth_state;
  res.clearCookie('oauth_state');
  if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);
  if (!code || !state || state !== expected) return res.status(400).send('Login expired or invalid. Go back and try again.');

  const tokens = await exchangeCode(code, redirectUri(req));
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  // 403 here usually means this account isn't on the app's User Management allowlist.
  if (!meRes.ok) return res.status(meRes.status).send(`Spotify said ${meRes.status}: ${await meRes.text()}`);
  const me = await meRes.json();

  const fields = { displayName: me.display_name, imageUrl: me.images?.[0]?.url };
  applyTokens(fields, tokens);
  const saved = await User.findOneAndUpdate({ spotifyId: me.id }, fields, { upsert: true, new: true });
  pollUser(saved).catch((err) => console.error('First poll failed:', err.message)); // start saving plays right away
  syncLibrary(saved).catch((err) => console.error('First library sync failed:', err.message));
  res.cookie('uid', saved.id, { ...cookieOpts, maxAge: 365 * 24 * 3600_000 });
  res.redirect('/');
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('uid');
  res.sendStatus(204);
});

export async function requireUser(req, res, next) {
  const id = req.signedCookies.uid;
  req.user = id && (await User.findById(id));
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}
