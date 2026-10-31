import { User } from './models/User.js';
import { Track } from './models/Track.js';
import { Artist } from './models/Artist.js';
import { spotifyGet } from './spotify.js';

// shortcut: Spotify publishes no Dev Mode limit; 1 lookup/sec ran into hours-long blocks, so 1 per 5s. Slow it more if blocks return.
const PAUSE_MS = 5000;
// shortcut: the link preview has no known limit; 40 back-to-back calls all passed. Slow this down if it starts failing.
const COVER_PAUSE_MS = 200;
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
    throw err; // a long 429 already paused everyone inside spotifyGet
  }
}

// Spotify's public link preview: just the cover, but no login and no API quota. '' = it has none.
async function previewCover(id) {
  const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`);
  if (res.status === 404 || res.status === 400) return '';
  if (!res.ok) throw new Error(`Spotify link preview ${res.status} for ${id}`);
  return (await res.json()).thumbnail_url ?? '';
}

// Does one lookup. Returns how long to wait before the next one, or 0 when there's nothing to do right now.
async function enrichNext(user) {
  // Covers first, from the link preview. The API lookup below swaps in a bigger one later.
  const bare = await Track.findOne({ albumImage: null }).sort({ playCount: -1 });
  if (bare) {
    await Track.updateOne({ _id: bare._id }, { albumImage: await previewCover(bare._id) });
    return COVER_PAUSE_MS;
  }

  if (user.enrichPausedUntil > Date.now()) return 0;
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
    return PAUSE_MS;
  }

  const track = await Track.findOne({ enrichedAt: null }).sort({ playCount: -1 });
  if (!track) return 0;
  const t = await lookup(user, `/tracks/${track._id}`);
  if (t) await saveTrack({ ...t, id: track._id }); // keep the id we were asked for, even if Spotify relinked it
  else await Track.updateOne({ _id: track._id }, { enrichedAt: new Date(), enrichFailed: true });
  return PAUSE_MS;
}

// Fills in as many covers/photos as fit in `ms` (used by /api/cron, where nothing runs forever). Returns how many.
export async function enrichFor(ms) {
  const stop = Date.now() + ms;
  let done = 0;
  while (Date.now() < stop) {
    const user = await User.findOne();
    const wait = user && (await enrichNext(user));
    if (!wait) break;
    done++;
    await sleep(wait);
  }
  return done;
}

// Runs forever in the background, filling in covers, artist photos and genres.
export async function startEnricher() {
  for (;;) {
    try {
      const user = await User.findOne();
      const wait = user && (await enrichNext(user));
      await sleep(wait || IDLE_MS);
    } catch (err) {
      console.error('Enrich error:', err.message);
      await sleep(IDLE_MS);
    }
  }
}
