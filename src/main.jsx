import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { installGlobalErrorReporting } from '@/lib/reportError'

installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)