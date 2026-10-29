import express, { Router } from 'express';
import { requireUser } from './auth.js';
import { importHistory } from '../importer.js';
import { Play } from '../models/Play.js';
import { Track } from '../models/Track.js';
import { Artist } from '../models/Artist.js';

export const importRouter = Router();

// One Streaming_History_Audio_*.json file per request (they're ~10-15 MB each).
importRouter.post('/', requireUser, express.json({ limit: '100mb' }), async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Not a Streaming_History_Audio file (expected a JSON list).' });
  }
  res.json(await importHistory(req.user._id, req.body));
});

importRouter.get('/status', requireUser, async (req, res) => {
  const bySource = await Play.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: '$source', n: { $sum: 1 } } },
  ]);
  const [tracksTotal, tracksDone, artistsTotal, artistsDone] = await Promise.all([
    Track.countDocuments(),
    Track.countDocuments({ enrichedAt: { $ne: null } }),
    Artist.countDocuments(),
    Artist.countDocuments({ enrichedAt: { $ne: null } }),
  ]);
  res.json({
    plays: Object.fromEntries(bySource.map((s) => [s._id, s.n])),
    tracks: { done: tracksDone, total: tracksTotal },
    artists: { done: artistsDone, total: artistsTotal },
  });
});
