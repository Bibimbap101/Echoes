import { Router } from 'express';
import { User } from '../models/User.js';
import { pollUser } from '../poller.js';
import { syncLibrary } from '../library.js';
import { enrichFor } from '../enrich.js';

const LIBRARY_EVERY_MS = 6 * 3600_000;
const ENRICH_MS = 15_000; // cron-job.org gives up after 30s, so answer well before that

export const cronRouter = Router();

// Hit every 30 minutes by an outside timer (cron-job.org) with "Authorization: Bearer <CRON_SECRET>".
// Does what the local server's nonstop loops do: save new plays, sync libraries, fill in covers.
cronRouter.get('/', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.sendStatus(401);

  const report = { users: [] };
  for (const user of await User.find()) {
    const r = { name: user.displayName };
    try {
      r.newPlays = await pollUser(user);
      if (!(user.library?.syncedAt > Date.now() - LIBRARY_EVERY_MS)) r.likedSongs = await syncLibrary(user);
    } catch (err) {
      r.error = err.message;
    }
    report.users.push(r);
  }
  try {
    report.covers = await enrichFor(ENRICH_MS);
  } catch (err) {
    report.coversError = err.message;
  }
  res.json(report);
});
