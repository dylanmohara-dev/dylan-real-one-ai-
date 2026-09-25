import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets a phone on the same WiFi reach the Vite dev server directly by
    // this Mac's LAN IP (e.g. http://192.168.1.23:5173) during
    // development, without needing the tunnel yet -- a quick sanity check
    // before setting one up. Has no effect on the production build.
    host: true,
    // Every frontend API call uses a plain relative "/api/..." path (see
    // useAppData.js and friends) so it works unchanged in the production
    // build, where the same Express server serves both the built assets
    // and /api. In dev, Vite serves the frontend on its own port (5173)
    // while Express runs separately on 3001 -- without this proxy, a
    // relative "/api/..." fetch would hit Vite itself (404/HTML fallback)
    // instead of the real backend. This forwards it transparently so the
    // exact same fetch call works in both modes with no cross-origin
    // request at all -- not just cosmetic: a raw cross-port
    // localhost:3001 fetch from the 5173 page is also what was silently
    // failing (ERR_BLOCKED_BY_CLIENT) during dev testing.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
