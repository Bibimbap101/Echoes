// Local server: the API plus the background jobs that run nonstop (on Vercel, /api/cron does their work instead).
import { app, connectDb } from './app.js';
import { startPoller } from './poller.js';
import { startEnricher } from './enrich.js';
import { startLibrarySync } from './library.js';

await connectDb();
console.log('Connected to MongoDB');
startPoller();
startEnricher();
startLibrarySync();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`Server on http://127.0.0.1:${port}`));
