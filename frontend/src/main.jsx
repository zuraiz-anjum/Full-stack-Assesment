import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SharedTripPage from './components/SharedTripPage.jsx'
import SplashIntro from './components/SplashIntro.jsx'
import './index.css'

// No client-side router for one extra screen -- a shared trip link is just
// a path of the form /shared/<uuid>, checked once at load time.
const sharedMatch = window.location.pathname.match(
  /^\/shared\/([0-9a-f-]{36})\/?$/i,
)

function rootFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center">
      <h1 className="text-lg font-semibold text-ink-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-500">
        The app hit an unexpected error. Reloading the page usually fixes it.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
      >
        Reload
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={rootFallback}>
      <SplashIntro />
      {sharedMatch ? <SharedTripPage shareToken={sharedMatch[1]} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
