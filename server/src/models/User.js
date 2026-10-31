import mongoose from 'mongoose';
import { seal, unseal } from '../secret.js';

const userSchema = new mongoose.Schema(
  {
    spotifyId: { type: String, required: true, unique: true },
    displayName: String,
    imageUrl: String,
    accessToken: { type: String, required: true, set: seal, get: unseal },
    refreshToken: { type: String, required: true, set: seal, get: unseal },
    tokenExpiresAt: { type: Date, required: true },
    enrichPausedUntil: Date, // Spotify blocked the app for a long time; no Spotify calls at all until then
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
