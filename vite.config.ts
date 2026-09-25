/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? '/webrtc-offline-pairing-ideas/' : '/'),
  plugins: [svelte()],
  server: {
    host: true,
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.trycloudflare.com',
      '.localtunnel.me',
    ],
  },
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: path.resolve(import.meta.dirname, './src/lib'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    globals: true,
  },
});
