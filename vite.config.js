import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Also run on older iPhones (iOS 14+), not just the latest browsers.
    target: ['es2020', 'safari14', 'chrome87', 'firefox78'],
  },
});
