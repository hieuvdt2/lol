import { useState } from 'react'
import { parseYoutubeLink } from '../game/board.ts'
import type { TvCommand } from '../game/videoScreen.ts'

interface TvPanelProps {
  /** Video do server phát cho hang (có thể rỗng). */
  serverVideos: readonly string[]
  playing: boolean
  onPlay: (ids: string[]) => boolean
  onStop: () => void
  onCommand: (name: TvCommand) => void
  onClose: () => void
}

/**
 * Bảng điều khiển màn hình lớn: phát video của hang hoặc video dán vào từ YouTube, tạm dừng, chuyển bài, tắt tiếng.
 * Video dán chỉ phát ở máy này (không gửi lên server). Trình phát chỉ được tải sau khi bấm "Phát".
 */
export function TvPanel({ serverVideos, playing, onPlay, onStop, onCommand, onClose }: TvPanelProps) {
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)

  const playHang = () => {
    setError('')
    setPaused(false)
    if (!onPlay([...serverVideos])) setError('Hang chưa có video nào.')
  }
  const playLink = () => {
    const id = parseYoutubeLink(link)
    if (!id) {
      setError('Đường dẫn chưa đúng. Dán link YouTube dạng youtube.com/watch?v=… hoặc youtu.be/…')
      return
    }
    setError('')
    setPaused(false)
    onPlay([id, ...serverVideos.filter((item) => item !== id)])
  }

  return (
    <section className="plaque hang-tv" aria-label="Màn hình lớn">
      <header>
        <strong>📺 Màn hình lớn</strong>
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onClose} aria-label="Đóng bảng màn hình lớn">
          ✕
        </button>
      </header>
      {playing ? (
        <div className="hang-tv-controls">
          <button
            type="button"
            className="carved-btn carved-btn--ghost"
            aria-label={paused ? 'Phát tiếp' : 'Tạm dừng'}
            onClick={() => {
              onCommand(paused ? 'play' : 'pause')
              setPaused(!paused)
            }}
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button type="button" className="carved-btn carved-btn--ghost" aria-label="Video kế tiếp" onClick={() => onCommand('next')}>
            ⏭
          </button>
          <button
            type="button"
            className="carved-btn carved-btn--ghost"
            aria-label={muted ? 'Bật tiếng video' : 'Tắt tiếng video'}
            aria-pressed={muted}
            onClick={() => {
              onCommand(muted ? 'unmute' : 'mute')
              setMuted(!muted)
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="carved-btn carved-btn--ghost" onClick={onStop}>
            ⏹ Tắt
          </button>
        </div>
      ) : (
        <div className="hang-tv-controls">
          <button type="button" className="carved-btn carved-btn--primary" disabled={serverVideos.length === 0} onClick={playHang}>
            ▶ Phát video của hang{serverVideos.length > 0 ? ` (${serverVideos.length})` : ''}
          </button>
        </div>
      )}
      <form
        className="hang-tv-link"
        onSubmit={(event) => {
          event.preventDefault()
          playLink()
        }}
      >
        <input type="text" inputMode="url" placeholder="Dán link YouTube…" aria-label="Link video YouTube" value={link} maxLength={300} onChange={(event) => setLink(event.target.value)} />
        <button type="submit" className="carved-btn carved-btn--primary" disabled={link.trim() === ''}>
          Phát
        </button>
      </form>
      {error ? <p className="hang-tv-error" role="alert">{error}</p> : null}
      <p className="hang-board-note">Video do YouTube phát, chỉ tải khi bạn bấm. Link bạn dán chỉ phát ở máy bạn.</p>
    </section>
  )
}
