import { useId, useSyncExternalStore } from 'react'
import { audio } from '../game/audio.ts'

/** Thanh âm lượng 0–100 (lưu `hangmu.volume`) và công tắc tắt tiếng. */
export function VolumePanel({ onClose }: { onClose: () => void }) {
  const id = useId()
  const volume = useSyncExternalStore(audio.subscribe, audio.getVolume)
  const muted = useSyncExternalStore(audio.subscribe, audio.getMuted)
  return (
    <section className="plaque hang-volume" aria-label="Âm lượng">
      <header>
        <strong>Âm thanh</strong>
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onClose}>Đóng</button>
      </header>
      <label htmlFor={id} className="hang-volume-row">
        <span>Âm lượng</span>
        <input id={id} type="range" min={0} max={100} step={1} value={muted ? 0 : volume} onChange={(event) => audio.setVolume(Number(event.target.value))} aria-valuetext={muted ? 'Đang tắt tiếng' : `${volume}%`} />
        <output htmlFor={id}>{muted ? 'tắt' : `${volume}%`}</output>
      </label>
      <button type="button" className="carved-btn carved-btn--ghost" aria-pressed={muted} onClick={() => audio.toggleMuted()}>
        {muted ? '🔇 Bật tiếng' : '🔊 Tắt tiếng'}
      </button>
    </section>
  )
}
