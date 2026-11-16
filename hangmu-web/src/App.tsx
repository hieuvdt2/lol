import { useEffect, useState } from 'react'
import { getMe, getRoomStatus, saveMe } from './api.ts'
import { Cave } from './components/Cave.tsx'
import { Hang } from './components/Hang.tsx'
import { QuizGate } from './components/QuizGate.tsx'
import { ConsentBanner } from './components/ConsentBanner.tsx'
import { Donate } from './components/Donate.tsx'
import { InstallHelp } from './components/InstallHelp.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import { LegalDialog } from './components/LegalDialog.tsx'
import { CharacterDialog } from './components/CharacterDialog.tsx'
import { TELEGRAM_URL } from './content/legal.ts'
import { readAnalyticsChoice, readIdentity, writeAnalyticsChoice, writeIdentity } from './storage.ts'
import type { AnalyticsChoice } from './storage.ts'
import type { RoomStatus, SavedIdentity } from './types.ts'

export function App() {
  const [sceneReady, setSceneReady] = useState(false)
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [identity, setIdentity] = useState<SavedIdentity | null>(() => readIdentity())
  const [naming, setNaming] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [legalOpen, setLegalOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsChoice>(() => readAnalyticsChoice())
  const [phase, setPhase] = useState<'lobby' | 'quiz' | 'cave'>('lobby')

  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      getRoomStatus(controller.signal).then((next) => {
        if (!controller.signal.aborted && next) setStatus(next)
      }).catch(() => {
        /* Bản ghi không tới được thì sảnh vẫn mở, không hiện số. */
      })
    }
    load()
    const timer = window.setInterval(load, 10_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  // Máy này chưa có tên nhưng server nhớ (cookie hm_sid, 14 ngày): lấy lại để khỏi nhập lại.
  useEffect(() => {
    if (readIdentity()) return
    const controller = new AbortController()
    getMe(controller.signal).then((me) => {
      if (me && !controller.signal.aborted) {
        writeIdentity(me)
        setIdentity((current) => current ?? me)
      }
    })
    return () => controller.abort()
  }, [])

  const chooseAnalytics = (choice: 'yes' | 'no') => {
    writeAnalyticsChoice(choice)
    setAnalytics(choice)
  }

  const saveIdentity = async (next: SavedIdentity) => {
    setSaveError(null)
    let final = next
    try {
      final = await saveMe(next)
    } catch (error) {
      // Đổi tên mà server không lưu được: giữ tên cũ, báo rõ (giống bản gốc). Lần đầu chưa có tên thì vẫn cho vào bằng tên trên máy.
      if (identity) {
        setNaming(false)
        setSaveError(`Chưa lưu được tên mới — bạn vẫn là “${identity.name}”. Bấm “Vào hang” để vào với tên này, hoặc thử đổi tên lại sau.${error instanceof Error && error.message ? ` (${error.message})` : ''}`)
        return
      }
    }
    writeIdentity(final)
    setIdentity(final)
    setNaming(false)
    setPhase('quiz')
  }

  // Đổi trang phục trong hang: lưu ngay trên máy, gửi hồ sơ lên server ở nền (lỗi thì thôi — lần vào hang sau vẫn gửi kèm mã ngoại hình).
  const saveOutfit = (next: SavedIdentity) => {
    writeIdentity(next)
    setIdentity(next)
    void saveMe(next).catch(() => {})
  }

  if (phase === 'cave' && identity) {
    return (
      <>
        <UpdateBanner />
        <Hang identity={identity} onLeave={() => setPhase('lobby')} onOutfit={saveOutfit} />
      </>
    )
  }

  return (
    <main className="home">
      <h1 className="visually-hidden">Hang Tê Đỏ — căn cứ của fan T1</h1>
      <UpdateBanner />
      <Cave onReady={() => setSceneReady(true)} />
      <aside className="stone-sign" aria-hidden="true">
        <img src="/images/emblem.svg" alt="" />
        <p>Căn cứ của fan T1</p>
        <strong>HANG TÊ ĐỎ</strong>
      </aside>

      <section className="home-panel plaque" aria-label="Hang Tê Đỏ">
        <div className="home-head">
          <p className="plaque-kicker">Căn cứ của fan T1</p>
          <p className="plaque-title home-title" id="home-title">
            Hang Tê Đỏ
          </p>
        </div>
        <hr className="plaque-rule" />
        <p className="home-lede">Nơi anh em Tê Đỏ tụ họp sau mỗi trận: thắng thì ăn mừng, thua thì có nhau.</p>
        {status ? (
          <p className="home-count">
            <span>Đang trong hang</span>
            <strong className="tally-num">{status.inRoom}</strong>
            {status.waiting > 0 ? (
              <span className="home-wait">· {status.waiting} người chờ ngoài cửa</span>
            ) : null}
          </p>
        ) : null}
        <button
          type="button"
          className="home-enter carved-btn carved-btn--primary"
          disabled={!sceneReady}
          aria-busy={!sceneReady}
          onClick={() => {
            setSaveError(null)
            if (identity) setPhase('quiz')
            else setNaming(true)
          }}
        >
          {sceneReady ? 'Vào hang' : 'Đang tải…'}
        </button>
        {saveError ? <p className="home-error" role="alert">{saveError}</p> : null}
        {identity ? (
          <p className="home-me">
            {identity.name}
            {' · '}
            <button type="button" className="legal-link" onClick={() => setNaming(true)}>
              Đổi nhân vật
            </button>
          </p>
        ) : null}
      </section>

      <nav className="home-links" aria-label="Liên kết khác">
        <a className="home-tele" href={TELEGRAM_URL} target="_blank" rel="noreferrer">
          Group Telegram
        </a>
        <InstallHelp />
      </nav>

      <footer className="home-footer">
        Trang của người hâm mộ, không liên kết chính thức với T1 hay Riot Games. ·{' '}
        <button type="button" className="legal-link" onClick={() => setLegalOpen(true)}>
          Điều khoản & quyền riêng tư
        </button>
      </footer>

      <Donate open={donateOpen} onToggle={() => setDonateOpen((open) => !open)} />

      {analytics === null ? (
        <ConsentBanner onChoose={chooseAnalytics} onDetails={() => setLegalOpen(true)} />
      ) : null}
      {legalOpen ? <LegalDialog onClose={() => setLegalOpen(false)} /> : null}
      {naming ? (
        <CharacterDialog initial={identity} onClose={() => setNaming(false)} onSave={saveIdentity} />
      ) : null}
      {phase === 'quiz' ? (
        <QuizGate onPass={() => setPhase('cave')} onCancel={() => setPhase('lobby')} />
      ) : null}
    </main>
  )
}
