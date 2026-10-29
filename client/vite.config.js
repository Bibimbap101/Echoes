import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spotify bans "localhost" redirects, so everything runs on 127.0.0.1 and /api is proxied (one origin, cookies just work).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
