import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n.tsx'
import { BrandingProvider } from './hooks/useBranding.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrandingProvider>
  </StrictMode>,
)
