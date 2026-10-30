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
