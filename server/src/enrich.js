import { User } from './models/User.js';
import { Track } from './models/Track.js';
import { Artist } from './models/Artist.js';
import { spotifyGet } from './spotify.js';

// shortcut: Spotify publishes no Dev Mode rate limit; 1 lookup/sec stays well clear. Lower it if 429s never show up.
const PAUSE_MS = 1000;
const IDLE_MS = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Saves a full Spotify track object (album cover comes with it, so no album calls are needed).
export async function saveTrack(track) {
  await Track.updateOne(
    { _id: track.id },
    {
      $set: {
        name: track.name,
        durationMs: track.duration_ms,
        albumId: track.album?.id,
        albumName: track.album?.name,
        albumImage: track.album?.images?.[0]?.url,
        releaseDate: track.album?.release_date,
        artistIds: track.artists.map((a) => a.id),
        artistNames: track.artists.map((a) => a.name),
        enrichedAt: new Date(),
      },
    },
    { upsert: true },
  );
  const artists = track.artists.filter((a) => a.id);
  if (artists.length) {
    await Artist.bulkWrite(
      artists.map((a) => ({
        updateOne: { filter: { _id: a.id }, update: { $setOnInsert: { name: a.name, enrichedAt: null } }, upsert: true },
      })),
    );
  }
}

// Not found / bad id: mark it done so it isn't retried forever. Anything else is thrown and retried later.
async function lookup(user, path) {
  try {
    return await spotifyGet(user, path);
  } catch (err) {
    if (err.spotifyStatus === 404 || err.spotifyStatus === 400) return null;
    if (err.spotifyStatus === 429) {
      await User.updateOne({ _id: user._id }, { enrichPausedUntil: new Date(Date.now() + err.retryAfter * 1000) });
    }
    throw err;
  }
}

async function enrichNext(user) {
  if (user.enrichPausedUntil > Date.now()) return false;
  // Artists first, so each newly looked-up track gets its artist photo right after.
  const artist = await Artist.findOne({ enrichedAt: null });
  if (artist) {
    const a = await lookup(user, `/artists/${artist._id}`);
    await Artist.updateOne(
      { _id: artist._id },
      a
        ? { name: a.name, image: a.images?.[0]?.url, genres: a.genres ?? [], enrichedAt: new Date() }
        : { enrichedAt: new Date(), enrichFailed: true },
    );
    return true;
  }

  const track = await Track.findOne({ enrichedAt: null }).sort({ playCount: -1 });
  if (!track) return false;
  const t = await lookup(user, `/tracks/${track._id}`);
  if (t) await saveTrack({ ...t, id: track._id }); // keep the id we were asked for, even if Spotify relinked it
  else await Track.updateOne({ _id: track._id }, { enrichedAt: new Date(), enrichFailed: true });
  return true;
}

// Fills in as many covers/photos as fit in `ms` (used by /api/cron, where nothing runs forever). Returns how many.
export async function enrichFor(ms) {
  const stop = Date.now() + ms;
  let done = 0;
  while (Date.now() < stop) {
    const user = await User.findOne();
    if (!user || !(await enrichNext(user))) break;
    done++;
    await sleep(PAUSE_MS);
  }
  return done;
}

// Runs forever in the background, filling in covers, artist photos and genres.
export async function startEnricher() {
  for (;;) {
    try {
      const user = await User.findOne();
      const worked = user && (await enrichNext(user));
      await sleep(worked ? PAUSE_MS : IDLE_MS);
    } catch (err) {
      console.error('Enrich error:', err.message);
      await sleep(IDLE_MS);
    }
  }
}
