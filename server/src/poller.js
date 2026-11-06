import { User } from './models/User.js';
import { spotifyGet } from './spotify.js';
import { insertPlays } from './importer.js';
import { saveTrack } from './enrich.js';
import { Play } from './models/Play.js';
import { playsSince } from './lastfm.js';

const EVERY_MS = 30 * 60_000;

// Last.fm keeps everything, so ask only for plays after the newest one saved.
async function pollLastfm(user) {
  const last = await Play.findOne({ userId: user._id }, { playedAt: 1, source: 1 }).sort({ playedAt: -1 }).lean();
  // After our own polls, re-read the last hour (the unique index drops repeats) in case a page shifted mid-read.
  // After an import, start just past it: export times are song ends, Last.fm's are song starts, so overlaps would double.
  const from = last && new Date(last.source === 'poll' ? +last.playedAt - 3600_000 : +last.playedAt + 1000);
  return insertPlays(user._id, await playsSince(user, from), 'poll');
}

// Spotify only remembers the last 50 plays, so just grab all 50 each time; the unique index drops repeats.
export async function pollUser(user) {
  if (user.lastfmName) return pollLastfm(user);
  const { items } = await spotifyGet(user, '/me/player/recently-played?limit=50');
  const songs = items.filter((i) => i.track?.id); // local files have no id

  const plays = songs.map(({ track, played_at }) => ({
    trackId: track.id,
    playedAt: new Date(played_at),
    // shortcut: this endpoint has no ms_played, so the whole song counts; import the export for real minutes.
    msPlayed: track.duration_ms,
    skipped: null,
    trackName: track.name,
    artistName: track.artists[0]?.name,
    albumName: track.album?.name,
  }));
  // Covers first: if we stop halfway, a play is never left without its track (nothing would fill it in later).
  for (const { track } of songs) await saveTrack(track); // full track objects come free with this call
  return insertPlays(user._id, plays, 'poll');
}

export function startPoller() {
  const run = async () => {
    for (const user of await User.find()) {
      try {
        const added = await pollUser(user);
        if (added) console.log(`Poll: ${added} new plays for ${user.displayName}`);
      } catch (err) {
        console.error(`Poll failed for ${user.displayName}:`, err.message);
      }
    }
  };
  run();
  setInterval(run, EVERY_MS);
}
