import { Router } from 'express';
import { User } from '../models/User.js';
import { pollUser } from '../poller.js';
import { syncLibrary } from '../library.js';
import { enrichFor } from '../enrich.js';

const LIBRARY_EVERY_MS = 6 * 3600_000;
const MIN_GAP_MS = 25 * 60_000; // a timer set to every minute once spent Spotify's whole daily quota
const ANSWER_BY_MS = 24_000;
const POLL_BY_MS = 18_000; // leaves a few seconds for covers // cron-job.org gives up after 30s, so answer well before that

export const cronRouter = Router();

// Hit every 30 minutes by an outside timer (cron-job.org) with "Authorization: Bearer <CRON_SECRET>".
// Does what the local server's nonstop loops do: save new plays, sync libraries, fill in covers.
cronRouter.get('/', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.sendStatus(401);
  const started = Date.now();
  if (await User.exists({ cronAt: { $gt: new Date(started - MIN_GAP_MS) } })) return res.json({ skipped: 'ran less than 25 minutes ago' });
  await User.updateMany({}, { cronAt: new Date(started) });

  const report = { users: [] };
  // Random order + a time limit: a big first Last.fm backlog can't push the same people past the 30s cutoff every run.
  const users = (await User.find()).sort(() => Math.random() - 0.5);
  for (const user of users) {
    if (Date.now() - started > POLL_BY_MS) break; // the rest get their turn next run
    const r = { name: user.displayName };
    try {
      r.newPlays = await pollUser(user);
      if (user.spotifyId && !(user.library?.syncedAt > Date.now() - LIBRARY_EVERY_MS)) r.likedSongs = await syncLibrary(user);
    } catch (err) {
      r.error = err.message;
    }
    report.users.push(r);
  }
  try {
    report.covers = await enrichFor(ANSWER_BY_MS - (Date.now() - started)); // whatever time the polling left over
  } catch (err) {
    report.coversError = err.message;
  }
  res.json(report);
});
