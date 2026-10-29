import mongoose from 'mongoose';

// One row per play. Names are copied in so stats work before any Spotify lookups happen.
const playSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trackId: { type: String, required: true },
  playedAt: { type: Date, required: true },
  msPlayed: { type: Number, required: true },
  skipped: { type: Boolean, default: null }, // null = unknown (polled plays)
  incognito: { type: Boolean, default: false },
  source: { type: String, enum: ['import', 'poll'], required: true },
  trackName: String,
  artistName: String,
  albumName: String,
});

// Blocks duplicates from overlapping export files, re-imports and repeated polls.
playSchema.index({ userId: 1, trackId: 1, playedAt: 1 }, { unique: true });
playSchema.index({ userId: 1, playedAt: 1 });

export const Play = mongoose.model('Play', playSchema);
