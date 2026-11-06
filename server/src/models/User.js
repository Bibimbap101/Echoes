import mongoose from 'mongoose';
import { seal, unseal } from '../secret.js';

const userSchema = new mongoose.Schema(
  {
    // A user logs in with Spotify (spotifyId + tokens) or with Last.fm (lastfmName + lastfmKey), never both.
    spotifyId: { type: String, unique: true, sparse: true },
    displayName: String,
    imageUrl: String,
    accessToken: { type: String, set: seal, get: unseal },
    refreshToken: { type: String, set: seal, get: unseal },
    tokenExpiresAt: Date,
    lastfmName: { type: String, unique: true, sparse: true },
    lastfmKey: { type: String, set: seal, get: unseal }, // Last.fm session key; never expires unless the user revokes it
    enrichPausedUntil: Date, // Spotify blocked the app for a long time; no Spotify calls at all until then
    cronAt: Date, // last time /api/cron did real work
    nowTrackId: String, // song /api/now-playing last saw; when it changes, the one before just ended
    library: {
      savedAlbums: Number,
      playlists: Number,
      following: Number,
      followedArtists: [String], // names, to match how plays group artists
      syncedAt: Date,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
