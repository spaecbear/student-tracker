import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startInstallCapture } from './pwa/install'
import { registerServiceWorker } from './pwa/updates'

// Installs the offline cache, and keeps this device on the current version.
registerServiceWorker()

// Chrome can fire the install prompt before React mounts, so capture it here.
startInstallCapture()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
