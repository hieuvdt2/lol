import { useState, useSyncExternalStore } from 'react'
import type { NetClient } from '../game/net.ts'

const MEDAL = ['🥇', '🥈', '🥉']
const SHOWN = 5

/**
 * Bảng "phong thần" tuần này ở góc trái (bản gốc có bốn mục; bản dựng lại mới có mục giao lưu võ thuật vì các trò khác chưa có).
 * Tên trùng với tên của mình thì tô nổi dòng đó.
 */
export function WeeklyBoard({ net, myName }: { net: NetClient; myName: string }) {
  const duel = net.duel
  const view = useSyncExternalStore(duel.subscribe, duel.getSnapshot)
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('hangmu.board') !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem('hangmu.board', v ? 'closed' : 'open')
      } catch {
        /* bỏ qua */
      }
      return !v
    })
  }
  const rows = view.rank.slice(0, SHOWN)
  return (
    <aside className="hang-weekly" aria-label="Bảng phong thần tuần này">
      <header>
        <div>
          <strong>🏆 Bảng phong thần tuần này</strong>
          <small>Đổi chủ 0h thứ Hai</small>
        </div>
        <button type="button" className="hang-weekly-toggle" aria-expanded={open} onClick={toggle}>{open ? 'Thu gọn' : 'Mở'}</button>
      </header>
      {open ? (
        <section>
          <h3>🥊 Cao thủ võ công <small>· top {SHOWN}</small><span>trận thắng</span></h3>
          {rows.length === 0 ? (
            <p className="hang-weekly-empty">Chưa ai thắng tuần này. Lại gần một người rồi nhấn V.</p>
          ) : (
            <ol>
              {rows.map((row, i) => (
                <li key={`${i}-${row.name}`} data-me={row.name === myName || undefined}>
                  <span className="hang-weekly-medal">{MEDAL[i] ?? i + 1}</span>
                  <span className="hang-weekly-name">{row.name}</span>
                  <span className="hang-weekly-wins">{row.wins}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </aside>
  )
}
