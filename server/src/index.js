import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { authRouter, requireUser } from './routes/auth.js';
import { importRouter } from './routes/import.js';
import { statsRouter } from './routes/stats.js';
import { spotifyGet } from './spotify.js';
import { startPoller } from './poller.js';
import { startEnricher } from './enrich.js';

for (const key of ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI', 'SESSION_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env (see .env.example)`);
}

const app = express();
app.use(cookieParser(process.env.SESSION_SECRET));

app.use('/api/auth', authRouter);
app.use('/api/import', importRouter);
app.use('/api/stats', statsRouter);

// Asks Spotify live, so a working response also proves token refresh works.
app.get('/api/me', requireUser, async (req, res) => {
  const me = await spotifyGet(req.user, '/me');
  res.json({ id: me.id, displayName: me.display_name, imageUrl: me.images?.[0]?.url ?? null });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message });
});

await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/echoes');
console.log('Connected to MongoDB');
startPoller();
startEnricher();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`Server on http://127.0.0.1:${port}`));
