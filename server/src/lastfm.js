import crypto from 'node:crypto';
import { Track } from './models/Track.js';

const API = 'https://ws.audioscrobbler.com/2.0/';
const GUESS_MS = 180_000; // Last.fm has no length or minutes listened; a song we can't match counts as 3 minutes

export const lastfmReady = () => Boolean(process.env.LASTFM_API_KEY && process.env.LASTFM_SECRET);

// Last.fm's signature: params sorted by name, joined as name+value, then the secret, md5'd. format is left out.
export function sign(params, secret) {
  const base = Object.keys(params).sort().filter((k) => k !== 'format').map((k) => k + params[k]).join('');
  return crypto.createHash('md5').update(base + secret, 'utf8').digest('hex');
}

// Every call is signed; with the user's session key (sk) Last.fm also shows plays they hid from the public.
export async function lastfmCall(params) {
  const p = { ...params, api_key: process.env.LASTFM_API_KEY };
  p.api_sig = sign(p, process.env.LASTFM_SECRET);
  const res = await fetch(`${API}?${new URLSearchParams({ ...p, format: 'json' })}`);
  const body = await res.json().catch(() => ({}));
  if (body.error) {
    // 29 = too many requests from our server, 26 = key suspended, 17 = plays hidden
    throw Object.assign(new Error(`Last.fm error ${body.error}: ${body.message}`), { status: body.error === 29 ? 503 : 502, lastfmError: body.error });
  }
  if (!res.ok) throw Object.assign(new Error(`Last.fm said ${res.status}`), { status: 502 });
  return body;
}

export const getSession = (token) => lastfmCall({ method: 'auth.getSession', token }).then((b) => b.session);

const recent = (user, extra) =>
  lastfmCall({ method: 'user.getRecentTracks', user: user.lastfmName, sk: user.lastfmKey, limit: 200, ...extra }).then((b) => b.recenttracks);

const key = (artist, name) => `${artist}|${name}`.toLowerCase();

// Last.fm only gives names. Reuse the Spotify id of a song Echoes already knows (from anyone's import or poll),
// so covers and top lists line up; otherwise a name-based id that never gets a Spotify lookup.
export async function matchTracks(rows) {
  const names = [...new Set(rows.map((r) => r.name))];
  const known = new Map();
  for (const t of await Track.find({ name: { $in: names } }, { name: 1, artistNames: 1, durationMs: 1, albumImage: 1 }).lean()) {
    for (const a of t.artistNames ?? []) known.set(key(a, t.name), t);
  }
  return rows.map((r) => {
    const t = known.get(key(r.artist, r.name));
    return { ...r, trackId: t?._id ?? `lfm:${key(r.artist, r.name)}`, durationMs: t?.durationMs ?? GUESS_MS, image: t?.albumImage ?? null };
  });
}

const row = (t) => ({ name: t.name, artist: t.artist?.['#text'] ?? '', album: t.album?.['#text'] || null });

// Finished plays since `from` (a Date, or null for everything), oldest first, at most `maxPages` calls.
// shortcut: one cron run reads up to 10 pages (2,000 plays); a bigger backlog finishes on later runs.
export async function playsSince(user, from, maxPages = 10) {
  const range = from ? { from: Math.floor(from / 1000) } : {};
  const first = await recent(user, range);
  const total = Number(first['@attr']?.totalPages ?? 1);
  const pages = [];
  // Oldest page first, so stopping early still moves forward: next time starts after the newest play saved.
  for (let page = total; page >= 1 && pages.length < maxPages; page--) {
    pages.push(page === 1 ? first : await recent(user, { ...range, page }));
  }
  const tracks = pages.flatMap((p) => [].concat(p.track ?? [])).filter((t) => t.date?.uts && t['@attr']?.nowplaying !== 'true');
  const matched = await matchTracks(tracks.map(row));
  return matched.map((m, i) => ({
    trackId: m.trackId,
    playedAt: new Date(Number(tracks[i].date.uts) * 1000),
    msPlayed: m.durationMs,
    skipped: null,
    trackName: m.name,
    artistName: m.artist,
    albumName: m.album,
  }));
}

// The song playing right now, or null.
export async function nowPlaying(user) {
  const t = [].concat((await recent(user, { limit: 1 })).track ?? [])[0];
  if (t?.['@attr']?.nowplaying !== 'true') return null;
  const [m] = await matchTracks([row(t)]);
  return m;
}
