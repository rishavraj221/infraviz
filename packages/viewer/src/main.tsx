import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import PackStudio from './components/PackStudio'
import ErrorBoundary from './components/ErrorBoundary'
import { STUDIO } from './demo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="infraviz">
      {STUDIO ? <PackStudio /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
