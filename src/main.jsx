import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { TeamModalProvider } from './context/TeamModalContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TeamModalProvider>
      <App />
    </TeamModalProvider>
  </StrictMode>,
)
