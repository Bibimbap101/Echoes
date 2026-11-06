import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { authRouter, requireUser } from './routes/auth.js';
import { importRouter } from './routes/import.js';
import { statsRouter } from './routes/stats.js';
import { cronRouter } from './routes/cron.js';
import { spotifyGet } from './spotify.js';
import { LikedSong } from './models/LikedSong.js';
import { User } from './models/User.js';
import { pollUser } from './poller.js';

for (const key of ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI', 'SESSION_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env (see .env.example)`);
}

// Connects once and reuses it (a serverless function keeps it between requests while warm).
let connecting;
export const connectDb = () => (connecting ??= mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/echoes'));

export const app = express();
app.use(async (req, res, next) => { await connectDb(); next(); });
app.use(cookieParser(process.env.SESSION_SECRET));

app.use('/api/auth', authRouter);
app.use('/api/import', importRouter);
app.use('/api/stats', statsRouter);
app.use('/api/cron', cronRouter);

// From what login saved: no Spotify call per page load, and a Spotify block doesn't log you out.
app.get('/api/me', requireUser, (req, res) => {
  const { spotifyId: id, displayName, imageUrl } = req.user;
  res.json({ id, displayName, imageUrl: imageUrl ?? null });
});

// What's playing right now, or null. Podcasts and ads come back as null too.
// shortcut: `liked` is only as fresh as the last library sync (6h); ask /me/tracks/contains if that ever matters.
app.get('/api/now-playing', requireUser, async (req, res) => {
  const now = await spotifyGet(req.user, '/me/player/currently-playing');
  const t = now?.currently_playing_type === 'track' ? now.item : null;
  // Song changed (or stopped): the last one just ended, so save plays now instead of waiting for the 30-minute poll.
  // The filter makes it one poll per change, even with two tabs open. Awaited so a serverless function isn't cut off.
  const id = t?.id ?? null;
  const changed = await User.updateOne({ _id: req.user._id, nowTrackId: { $ne: id } }, { nowTrackId: id });
  if (changed.modifiedCount) await pollUser(req.user).catch((err) => console.error('Song-change poll failed:', err.message));
  if (!t) return res.json(null);
  res.json({
    id: t.id, name: t.name, artist: t.artists.map((a) => a.name).join(', '), image: t.album?.images?.[0]?.url ?? null,
    durationMs: t.duration_ms, progressMs: now.progress_ms, isPlaying: now.is_playing,
    liked: Boolean(t.id && (await LikedSong.exists({ userId: req.user._id, trackId: t.id }))),
    spotifyUrl: t.external_urls?.spotify ?? null,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message });
});
