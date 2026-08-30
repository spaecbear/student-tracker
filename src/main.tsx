import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { requestPersistence } from './pwa/storage'
import { startInstallCapture } from './pwa/install'
import { registerServiceWorker } from './pwa/updates'

// Ask once, as early as possible: without this grant the browser may evict a
// year of attendance under storage pressure. The teacher view reports the answer.
void requestPersistence()

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
