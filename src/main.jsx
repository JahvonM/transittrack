import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// The website's look for the phone and tablet apps (passenger, driver, boarding).
import '@/appSea.css'
import { installGlobalErrorReporting } from '@/lib/reportError'
import { installOfflineRunners } from '@/lib/offlineRunners'
import { captureInstallPrompt, installContext } from '@/lib/appInstall'
import { isSiteHost } from '@/lib/bookingSite'
import { installKeyboardHandling } from '@/lib/typingKeyboard'
import { readHomeScreenCode } from '@/lib/homeScreenSignIn'
import { storedAccessToken } from 'tt-backend'
import { base44 } from '@/api/base44Client'

installGlobalErrorReporting()
installOfflineRunners()
installKeyboardHandling(window)
// Chrome offers to install the app just after load; keep that offer for the
// first-open "Get the app" screen (not on the public website).
if (!isSiteHost(window.location.hostname)) captureInstallPrompt(window)

// Save the app on this device so it opens with no WiFi (bus boarding and
// driver tablets especially). Production builds only - not the editor preview.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const render = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// iPhone Home Screen app, first open: the one-time code Safari gave it signs
// it in, then the app opens signed in (see lib/homeScreenSignIn.js). The code
// leaves the address straight away; later opens just drop it. Only the Home
// Screen app uses it: a copied Safari link opened in a browser does not.
const carried = readHomeScreenCode(window.location)
if (!carried) render()
else {
  try { window.history.replaceState(window.history.state, '', carried.clean) } catch { /* ignore */ }
  if (!carried.code || storedAccessToken() || !installContext(window).standalone) render()
  else base44.auth.signInWithHomeScreenCode(carried.code).then(() => window.location.replace(carried.clean), render)
}