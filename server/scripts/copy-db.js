// Copies everything from your local database to another one (e.g. MongoDB Atlas).
// Usage: npm run copy-db -- "mongodb+srv://..."   (rows that already exist there are skipped)
import mongoose from 'mongoose';

const target = process.argv[2];
if (!target?.startsWith('mongodb')) throw new Error('Pass the target connection string: npm run copy-db -- "mongodb+srv://..."');

const from = await mongoose.createConnection(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/echoes').asPromise();
const to = await mongoose.createConnection(target).asPromise();

for (const name of ['users', 'plays', 'tracks', 'artists', 'likedsongs']) {
  const docs = await from.db.collection(name).find().toArray();
  let added = 0;
  for (let i = 0; i < docs.length; i += 5000) {
    try {
      added += (await to.db.collection(name).insertMany(docs.slice(i, i + 5000), { ordered: false })).insertedCount;
    } catch (err) {
      if (err.code !== 11000 && !err.writeErrors?.every((e) => e.code === 11000)) throw err;
      added += err.result?.insertedCount ?? 0;
    }
  }
  console.log(`${name}: copied ${added} of ${docs.length}`);
}
await Promise.all([from.close(), to.close()]);
