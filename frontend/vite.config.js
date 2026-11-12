import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Three.js is isolated behind a lazy dashboard section and ships at ~135 KB gzipped.
  build: { chunkSizeWarningLimit: 600 },
});
