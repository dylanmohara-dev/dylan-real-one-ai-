import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registering the service worker is what makes the browser (and iOS Safari,
// which is what actually renders "Chrome" on an iPhone) treat this as an
// installable app -- without it, "Add to Home Screen" just bookmarks the
// page instead of giving Dylan a real app icon and a standalone window.
// Skipped outside a secure context (plain http://<lan-ip>) since browsers
// refuse to register service workers there at all except on localhost --
// this will need a real tunnel (which serves https) or localhost to take
// effect, not raw LAN http.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}
