import { User } from './models/User.js';
import { LikedSong } from './models/LikedSong.js';
import { spotifyGet } from './spotify.js';
import { saveTrack } from './enrich.js';

const EVERY_MS = 6 * 3600_000;

// Follows Spotify's `next` links to the end of a list.
async function all(user, url, pick = (page) => page) {
  const items = [];
  while (url) {
    const page = pick(await spotifyGet(user, url));
    items.push(...page.items);
    url = page.next;
  }
  return items;
}

// Mirrors Liked Songs and saves follow/album/playlist counts. ~1 request per 50 liked songs.
export async function syncLibrary(user) {
  const syncedAt = new Date();
  const songs = (await all(user, '/me/tracks?limit=50')).filter((x) => x.track?.id);
  if (songs.length) {
    await LikedSong.bulkWrite(
      songs.map(({ track, added_at }) => ({
        updateOne: { filter: { userId: user._id, trackId: track.id }, update: { $set: { addedAt: new Date(added_at), syncedAt } }, upsert: true },
      })),
      { ordered: false },
    );
  }
  // Only reached when the whole list came back, so anything not seen was unliked.
  await LikedSong.deleteMany({ userId: user._id, syncedAt: { $ne: syncedAt } });
  for (const { track } of songs) await saveTrack(track); // free covers for liked songs

  const following = await all(user, '/me/following?type=artist&limit=50', (p) => p.artists);
  const [albums, playlists] = await Promise.all([
    spotifyGet(user, '/me/albums?limit=1'),
    spotifyGet(user, '/me/playlists?limit=1'),
  ]);
  user.library = {
    savedAlbums: albums.total,
    playlists: playlists.total,
    following: following.length,
    followedArtists: following.map((a) => a.name),
    syncedAt,
  };
  await user.save();
  return songs.length;
}

export function startLibrarySync() {
  const run = async () => {
    for (const user of await User.find({ spotifyId: { $exists: true } })) {
      try {
        console.log(`Library: synced ${await syncLibrary(user)} liked songs for ${user.displayName}`);
      } catch (err) {
        console.error(`Library sync failed for ${user.displayName}:`, err.message);
      }
    }
  };
  run();
  setInterval(run, EVERY_MS);
}
