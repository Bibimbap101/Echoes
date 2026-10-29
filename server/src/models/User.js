import mongoose from 'mongoose';

// shortcut: tokens stored in plain text, fine for a local single-user app; encrypt before hosting it anywhere.
const userSchema = new mongoose.Schema(
  {
    spotifyId: { type: String, required: true, unique: true },
    displayName: String,
    imageUrl: String,
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
