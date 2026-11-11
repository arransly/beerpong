import { defineConfig } from 'vite';

const serverTarget = process.env.DEV_SERVER_TARGET || 'http://localhost:3001';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: serverTarget, ws: true },
      '/livekit-token': { target: serverTarget },
      '/health': { target: serverTarget },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
