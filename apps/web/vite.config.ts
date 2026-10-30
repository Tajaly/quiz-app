import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Falls back to the next free port if 5173 is busy (local Entra sign-in expects 5173 though).
    strictPort: false,
    proxy: {
      '/api': apiTarget,
      '/healthz': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
