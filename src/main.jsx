import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { installGlobalErrorReporting } from '@/lib/reportError'
import { installOfflineRunners } from '@/lib/offlineRunners'

installGlobalErrorReporting()
installOfflineRunners()

// Save the app on this device so it opens with no WiFi (bus boarding and
// driver tablets especially). Production builds only - not the editor preview.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)