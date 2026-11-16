import { useSyncExternalStore } from 'react'
import type { NetClient } from '../game/net.ts'

/** Bảng "Võ công cao nhất hang": top thắng giao lưu võ thuật trong tuần (server làm mới mỗi thứ Hai). */
export function RankPanel({ net, onClose }: { net: NetClient; onClose: () => void }) {
  const duel = net.duel
  const view = useSyncExternalStore(duel.subscribe, duel.getSnapshot)
  return (
    <section className="plaque hang-rank" aria-label="Võ công cao nhất hang">
      <header>
        <strong>Võ công cao nhất hang</strong>
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onClose}>Đóng</button>
      </header>
      {view.rank.length === 0 ? (
        <p className="hang-rank-empty">Tuần này chưa có ai thắng. Lại gần một người rồi bấm 🥊 Giao lưu võ thuật.</p>
      ) : (
        <ol>
          {view.rank.map((row, i) => (
            <li key={`${i}-${row.name}`}>
              <span className="hang-rank-pos">{i + 1}</span>
              <span className="hang-rank-name">{row.name}</span>
              <span className="hang-rank-wins">{row.wins} thắng</span>
            </li>
          ))}
        </ol>
      )}
      <p className="hang-rank-note">Làm mới mỗi thứ Hai.</p>
    </section>
  )
}
