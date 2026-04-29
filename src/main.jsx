import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const embedSessionKey =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('_fbReset') || '0'
    : '0'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App key={embedSessionKey} />
  </StrictMode>,
)
