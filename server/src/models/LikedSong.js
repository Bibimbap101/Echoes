import mongoose from 'mongoose';

// Your Liked Songs, mirrored from Spotify. syncedAt marks rows seen in the latest sync.
const likedSongSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trackId: { type: String, required: true },
  addedAt: { type: Date, required: true },
  syncedAt: Date,
});

likedSongSchema.index({ userId: 1, trackId: 1 }, { unique: true });
likedSongSchema.index({ userId: 1, addedAt: 1 });

export const LikedSong = mongoose.model('LikedSong', likedSongSchema);
