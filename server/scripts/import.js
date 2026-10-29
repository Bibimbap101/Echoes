// Usage: npm run import -- "C:\path\to\Spotify Extended Streaming History" [spotifyUserId]
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { importHistory } from '../src/importer.js';

const [dir, spotifyId] = process.argv.slice(2);
if (!dir) throw new Error('Give the folder that holds your Streaming_History_Audio_*.json files.');

await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/echoes');

const users = await User.find(spotifyId ? { spotifyId } : {});
if (users.length !== 1) {
  throw new Error(users.length ? 'More than one user. Add your Spotify user id after the folder.' : 'No user yet. Log in through the app first.');
}

const files = (await fs.readdir(dir)).filter((f) => /^Streaming_History_Audio_.*\.json$/i.test(f)).sort();
if (!files.length) throw new Error(`No Streaming_History_Audio_*.json files in ${dir}`);

for (const file of files) {
  const rows = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const r = await importHistory(users[0]._id, rows);
  console.log(`${file}: ${r.added} new plays (${r.plays - r.added} already saved, ${r.rows - r.plays} podcasts/other skipped)`);
}

await mongoose.disconnect();
console.log('Done. Covers and artist photos fill in while the server runs.');
