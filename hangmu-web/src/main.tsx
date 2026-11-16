import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Thiếu #root')

// Service worker tối thiểu (không cache) chỉ để trình duyệt cho cài thành ứng dụng; chỉ đăng ký ở bản production.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
