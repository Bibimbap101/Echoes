import { Play } from './models/Play.js';
import { Track } from './models/Track.js';

const TRACK_PREFIX = 'spotify:track:';
const CHUNK = 5000;

// Extended Streaming History rows -> plays. Podcasts/audiobooks have no track URI and are dropped.
// ip_addr, conn_country etc. are never copied.
export function parseHistory(rows) {
  return rows
    .filter((r) => r?.ts && r.spotify_track_uri?.startsWith(TRACK_PREFIX))
    .map((r) => ({
      trackId: r.spotify_track_uri.slice(TRACK_PREFIX.length),
      playedAt: new Date(r.ts), // when the stream ENDED, UTC
      msPlayed: r.ms_played ?? 0,
      skipped: r.skipped === true || r.reason_end === 'fwdbtn', // skipped is often null in older rows
      incognito: r.incognito_mode === true,
      trackName: r.master_metadata_track_name,
      artistName: r.master_metadata_album_artist_name,
      albumName: r.master_metadata_album_album_name,
    }));
}

// Inserts plays, silently skipping ones already saved. Returns how many were new.
export async function insertPlays(userId, plays, source) {
  if (!plays.length) return 0;
  try {
    const docs = await Play.insertMany(plays.map((p) => ({ ...p, userId, source })), { ordered: false });
    return docs.length;
  } catch (err) {
    const errors = [].concat(err.writeErrors ?? []);
    if (!errors.length || errors.some((e) => e.code !== 11000)) throw err;
    return err.insertedDocs?.length ?? 0;
  }
}

export async function importHistory(userId, rows) {
  const plays = parseHistory(rows);
  if (!plays.length) return { rows: rows.length, plays: 0, added: 0 };

  // The export has real minutes and skips, so it replaces any polled plays in the time it covers.
  const end = plays.reduce((max, p) => (p.playedAt > max ? p.playedAt : max), plays[0].playedAt);
  await Play.deleteMany({ userId, source: 'poll', playedAt: { $lte: end } });

  let added = 0;
  for (let i = 0; i < plays.length; i += CHUNK) added += await insertPlays(userId, plays.slice(i, i + CHUNK), 'import');

  await queueTracks(plays);
  return { rows: rows.length, plays: plays.length, added };
}

// Adds unknown tracks to the lookup queue; most-played ones get looked up first.
async function queueTracks(plays) {
  const byId = new Map();
  for (const p of plays) {
    const t = byId.get(p.trackId) ?? { ...p, count: 0 };
    t.count++;
    byId.set(p.trackId, t);
  }
  const ops = [...byId.values()].map((t) => ({
    updateOne: {
      filter: { _id: t.trackId },
      update: {
        $setOnInsert: { name: t.trackName, artistNames: [t.artistName], albumName: t.albumName, enrichedAt: null },
        $inc: { playCount: t.count },
      },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += CHUNK) await Track.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
}
