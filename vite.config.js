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
  },
})
