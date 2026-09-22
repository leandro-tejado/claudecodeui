import React from 'react'
import ReactDOM from 'react-dom/client'

import App from '@/App'
import { loadSavedLanguage } from '@/modules/i18n'
import '@/index.css'

// React Scan is a render-diagnostics overlay, and an expensive one: measured on
// this app it roughly halves the dev frame rate, adds ~14 MB of heap and injects
// a few thousand DOM nodes of its own. It is worth all of that while hunting a
// render bug and worth none of it the rest of the time, so it is opt-in —
// `localStorage.setItem('react-scan', 'on')` and reload.
//
// The import is dynamic and the condition is a literal `import.meta.env.DEV` so
// that Vite drops this whole branch from the production build. It was a static
// import until 22-sep-2026, which put 613 KB of diagnostics — the single heaviest
// package in the bundle — in front of every user on their first load.
if (import.meta.env.DEV && localStorage.getItem('react-scan') === 'on') {
  import('react-scan').then(({ scan }) => scan({ enabled: true }))
}

// The service worker is registered from index.html, not here: that copy runs
// before the bundle is parsed and passes `updateViaCache: 'none'` plus an explicit
// update(), which is what stops a stale worker from perpetuating itself. A second
// registration from here raced it with weaker options.

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Unable to mount the app: #root is missing from the document')
}

// Only English is bundled, so a user who chose another language would otherwise
// watch the interface render in English and swap a moment later. Waiting for that
// one small chunk costs a request the app was going to make anyway; if it fails,
// loadSavedLanguage resolves and the app mounts in English.
void loadSavedLanguage().then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
