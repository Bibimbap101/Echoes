import { Router } from 'express';
import { requireUser } from './auth.js';
import * as stats from '../stats.js';

export const statsRouter = Router();
statsRouter.use(requireUser);

const TYPES = ['tracks', 'artists', 'albums', 'genres'];

statsRouter.get('/top/:type', async (req, res) => {
  if (!TYPES.includes(req.params.type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  res.json(await stats.top(req.user, req.params.type, req.query));
});

for (const name of ['summary', 'clock', 'timeline', 'streak', 'skips', 'recent', 'wrapped']) {
  statsRouter.get(`/${name}`, async (req, res) => res.json(await stats[name](req.user._id, req.query)));
}
statsRouter.get('/first', async (req, res) => res.json(await stats.firstListened(req.user._id, req.query)));
