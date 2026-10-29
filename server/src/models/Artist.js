import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema({
  _id: String, // Spotify artist id
  name: { type: String, index: true },
  image: String,
  genres: [String], // Spotify marks this deprecated; often empty
  enrichedAt: { type: Date, default: null, index: true },
  enrichFailed: Boolean,
});

export const Artist = mongoose.model('Artist', artistSchema);
