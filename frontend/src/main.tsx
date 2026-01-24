import React from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import App from './modules/App'
import ClerkWrapper from './modules/auth/ClerkWrapper'
import { PrompdProvider } from '@prompd/react'
import ErrorBoundary from './modules/components/ErrorBoundary'
import './styles/styles.css'
import './styles/clerk-overrides.css'
import './styles/prompd-chat-overrides.css'

// Note: HotkeyManager is a singleton (hotkeyManager from services/hotkeyManager.ts)
// No provider wrapper needed - import and use directly where needed

// Hide splash screen when app is ready
function hideSplashScreen() {
  const splash = document.getElementById('splash-screen')
  const body = document.body

  if (splash) {
    // Update version text before hiding
    const versionEl = document.getElementById('splash-version')
    if (versionEl) {
      versionEl.textContent = 'Ready'
    }

    // Small delay to show "Ready" state
    setTimeout(() => {
      splash.classList.add('hidden')
      body.classList.remove('splash-active')

      // Remove splash from DOM after transition
      setTimeout(() => {
        splash.remove()
      }, 300)
    }, 200)
  }
}

// Render the React app
function renderApp() {
  const container = document.getElementById('root')!
  const root = createRoot(container)

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ClerkWrapper>
          <PrompdProvider
            apiBaseUrl="http://localhost:4050"
            mode="editor"
            theme="auto"
          >
            <App />
          </PrompdProvider>
        </ClerkWrapper>
      </ErrorBoundary>
    </React.StrictMode>
  )

  // Hide splash after React has rendered
  // Use requestIdleCallback for better timing, with setTimeout fallback
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => hideSplashScreen(), { timeout: 2000 })
  } else {
    setTimeout(hideSplashScreen, 500)
  }
}

// Pre-initialize Monaco editor BEFORE React renders to avoid cancellation errors
// in React StrictMode (which double-renders components). Without this, the Editor
// component would start loading Monaco, get unmounted, cancel the load, then remount.
// We wait for Monaco to fully load before rendering the app.
loader.init().then(() => {
  console.log('[main.tsx] Monaco editor pre-initialized, rendering app...')
  renderApp()
}).catch((err) => {
  // Even on error, render the app - Monaco will retry when Editor mounts
  console.error('[main.tsx] Monaco pre-init failed, rendering app anyway:', err)
  renderApp()
})

