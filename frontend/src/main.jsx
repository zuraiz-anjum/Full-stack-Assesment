import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import NotFoundPage from './components/NotFoundPage.jsx'
import SharedTripPage from './components/SharedTripPage.jsx'
import SplashIntro from './components/SplashIntro.jsx'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { forceLightForPrint } from './lib/theme.js'
import './index.css'

// No client-side router for two extra screens -- a shared trip link is just
// a path of the form /shared/<uuid>, checked once at load time. Anything
// else (Vercel rewrites every path to this same index.html, so there's no
// server-side 404) falls through to the client-rendered NotFoundPage below.
const sharedMatch = window.location.pathname.match(
  /^\/shared\/([0-9a-f-]{36})\/?$/i,
)
const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const isKnownRoute = normalizedPath === '/' || !!sharedMatch

forceLightForPrint()

function rootFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center dark:bg-[#121210]">
      <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
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
      <ThemeProvider>
        {isKnownRoute ? (
          <>
            <SplashIntro />
            {sharedMatch ? <SharedTripPage shareToken={sharedMatch[1]} /> : <App />}
          </>
        ) : (
          <NotFoundPage />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
