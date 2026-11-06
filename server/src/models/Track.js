import mongoose from 'mongoose';

// Cache of Spotify track info. enrichedAt: null means "still waiting for a lookup".
const trackSchema = new mongoose.Schema({
  _id: String, // Spotify track id
  name: String,
  durationMs: Number,
  albumId: String,
  albumName: String,
  albumImage: String,
  releaseDate: String,
  artistIds: [String],
  artistNames: [String],
  playCount: { type: Number, default: 0 }, // only decides lookup order: most-played first
  enrichedAt: { type: Date, default: null },
  enrichFailed: Boolean,
});

trackSchema.index({ enrichedAt: 1, playCount: -1 });
trackSchema.index({ name: 1 }); // Last.fm plays come with names only

export const Track = mongoose.model('Track', trackSchema);
