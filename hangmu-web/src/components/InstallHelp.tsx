import { useEffect, useState } from 'react'
import { detectPlatform, installSteps } from '../install.ts'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

/** Nút "Cài như app" + hộp thoại hướng dẫn. Ẩn khi đã chạy như ứng dụng. */
export function InstallHelp() {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const platform = detectPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault() // giữ lại để bấm nút của mình mới hiện hộp thoại cài của trình duyệt
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
      setOpen(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice.catch(() => null)
    setPrompt(null)
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="home-install" onClick={() => (prompt ? void install() : setOpen(true))}>
        Cài như app
      </button>
      {open ? (
        <div className="name-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="name-dialog plaque" role="dialog" aria-modal="true" aria-label="Cài Hang Tê Đỏ như ứng dụng" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <h2>Cài Hang Tê Đỏ như ứng dụng</h2>
            <ol className="install-steps">
              {installSteps(platform).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="name-actions">
              <button type="button" className="name-cancel carved-btn carved-btn--ghost" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
