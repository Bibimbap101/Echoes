import { User } from './models/User.js';
import { spotifyGet } from './spotify.js';
import { insertPlays } from './importer.js';
import { saveTrack } from './enrich.js';

const EVERY_MS = 30 * 60_000;

// Spotify only remembers the last 50 plays, so just grab all 50 each time; the unique index drops repeats.
export async function pollUser(user) {
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
  const added = await insertPlays(user._id, plays, 'poll');

  // Full track objects come free with this call, so no lookup needed later.
  for (const { track } of songs) await saveTrack(track);
  return added;
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
