import { useSyncExternalStore } from 'react'
import type { NetClient } from '../game/net.ts'
import { ITEMS, NICKNAMES, SLOTS } from '../game/rage.ts'

/** Bảng ném đồ 2D (bản gốc ném trong cảnh 3D). */
export function RagePanel({ net, onClose }: { net: NetClient; onClose: () => void }) {
  const rage = net.rage
  const v = useSyncExternalStore(rage.subscribe, rage.getSnapshot)
  return (
    <section className="plaque hang-rage" aria-label="Ném đồ">
      <header>
        <strong>Ném đồ · hôm nay {v.today} lần</strong>
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onClose}>Đóng</button>
      </header>
      <p className="hang-rage-hint">Bấm hoặc chạm vào cảnh để ném đúng chỗ đó.<span className="hang-rage-keys"> ◀ ▶ hoặc nút bên dưới để đổi hình nộm.</span></p>
      <div className="hang-rage-slots" role="radiogroup" aria-label="Chọn mục tiêu">
        {Array.from({ length: SLOTS }, (_, slot) => (
          <button key={slot} type="button" role="radio" aria-checked={v.slot === slot} className={`carved-btn ${v.slot === slot ? 'carved-btn--primary' : 'carved-btn--ghost'}`} onClick={() => rage.setSlot(slot)}>
            {NICKNAMES[v.labels[slot] ?? 0]}
          </button>
        ))}
      </div>
      <div className="hang-rage-items" role="radiogroup" aria-label="Chọn đồ ném">
        {ITEMS.map((label, item) => (
          <button key={label} type="button" role="radio" aria-checked={v.item === item} className={`carved-btn ${v.item === item ? 'carved-btn--primary' : 'carved-btn--ghost'}`} onClick={() => rage.setItem(item)}>
            {label}
          </button>
        ))}
      </div>
      <label className="hang-rage-label">
        Đổi nhãn ô đang chọn:
        <select value={v.labels[v.slot] ?? 0} onChange={(e) => rage.relabel(v.slot, Number(e.target.value))}>
          {NICKNAMES.map((name, i) => (
            <option key={name} value={i}>{name}</option>
          ))}
        </select>
      </label>
      <button type="button" className="carved-btn carved-btn--primary" onClick={() => rage.throwAt()}>
        Ném nhanh: {ITEMS[v.item]} → {NICKNAMES[v.labels[v.slot] ?? 0]}
      </button>
      {v.hits.length > 0 ? <p className="hang-rage-log">{v.hits.map((h) => ITEMS[h.item]?.split(' ')[0]).join(' ')}</p> : null}
    </section>
  )
}
