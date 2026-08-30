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

// Being installed is one of the signals Chrome weighs when deciding whether to
// protect an origin's storage, but the request above already ran and was
// answered before that was true. Ask once more the moment the app is
// installed, rather than leaving the teacher to find the button herself.
window.addEventListener('appinstalled', () => {
  void requestPersistence()
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
