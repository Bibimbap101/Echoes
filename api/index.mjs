// Vercel runs every /api/* request through the same Express app the local server uses.
export { app as default } from '../server/src/app.js';
