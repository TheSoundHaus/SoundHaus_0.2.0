import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global error handlers to catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('[SoundHaus] UNCAUGHT ERROR:', event.error?.message || event.message, event.error?.stack)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[SoundHaus] UNHANDLED REJECTION:', event.reason)
})

console.log('[SoundHaus] main.tsx: mounting React app')
const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('[SoundHaus] FATAL: #root element not found')
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  console.log('[SoundHaus] main.tsx: React app mounted successfully')
}
