import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface JoyVector {
  /** -1 (trái) .. 1 (phải) */
  x: number
  /** -1 (lùi) .. 1 (tiến) */
  y: number
}

const RADIUS = 46

/** Cần điều khiển ảo. Báo vector qua `onChange`, vòng lặp game đọc giá trị mới nhất mỗi khung hình. */
function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const active = useRef<number | null>(null)

  const apply = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = base.current
    if (!el) return
    const box = el.getBoundingClientRect()
    let dx = event.clientX - (box.left + box.width / 2)
    let dy = event.clientY - (box.top + box.height / 2)
    const length = Math.hypot(dx, dy)
    if (length > RADIUS) {
      dx = (dx / length) * RADIUS
      dy = (dy / length) * RADIUS
    }
    onChange(dx / RADIUS, -dy / RADIUS)
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return
    active.current = null
    onChange(0, 0)
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
  }
  // Cần bị gỡ khỏi màn hình khi ngón tay còn đặt trên đó (có lời mời, chat riêng, duel...) thì sự kiện nhả không bao giờ tới:
  // không xả về 0 thì nhân vật cứ tự đi theo vector cuối cùng.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => () => onChangeRef.current(0, 0), [])

  return (
    <div
      ref={base}
      className="touch-joy"
      role="application"
      aria-label="Cần điều khiển"
      onPointerDown={(event) => {
        // Có thể còn sót ngón cũ nếu sự kiện nhả bị mất (iOS đôi khi bỏ pointerup): ngón mới luôn được ưu tiên.
        active.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        apply(event)
      }}
      onPointerMove={(event) => active.current === event.pointerId && apply(event)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={knob} className="touch-joy-knob" />
    </div>
  )
}

interface TouchControlsProps {
  onMove: (x: number, y: number) => void
  sitting: boolean
  canSit: boolean
  chatOpen: boolean
  onPunch: () => void
  onSit: () => void
  onEmote: () => void
  onToggleChat: () => void
}

export function TouchControls({ onMove, sitting, canSit, chatOpen, onPunch, onSit, onEmote, onToggleChat }: TouchControlsProps) {
  return (
    <div className="hang-touch">
      <Joystick onChange={onMove} />
      <div className="touch-actions">
        <button type="button" className="touch-btn" aria-label="Mở chat" aria-pressed={chatOpen} onClick={onToggleChat}>
          💬
        </button>
        {canSit || sitting ? (
          <button type="button" className="touch-btn" aria-label={sitting ? 'Đứng dậy' : 'Ngồi'} onClick={onSit}>
            🪑
          </button>
        ) : null}
        <button type="button" className="touch-btn" aria-label="Ăn mừng" disabled={sitting} onClick={onEmote}>
          🎉
        </button>
        <button type="button" className="touch-btn touch-btn--hit" aria-label="Đấm" disabled={sitting} onClick={onPunch}>
          👊
        </button>
      </div>
    </div>
  )
}
