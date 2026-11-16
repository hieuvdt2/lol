import { useState } from 'react'
import { embedUrl } from '../game/board.ts'
import type { NetState } from '../game/net.ts'

/**
 * Màn hình hội trường: khi đang ngồi và server có phát video/nhạc thì hiện nút phát. Nội dung bên thứ ba (trình phát nhúng)
 * chỉ được tải SAU KHI người dùng bấm: tôn trọng quyền riêng tư và chính sách tự phát của trình duyệt.
 */
export function BoardPanel({ state, sitting }: { state: NetState; sitting: boolean }) {
  const [chosen, setChosen] = useState<'video' | 'music' | null>(null)
  const { boardVideos, boardMusic } = state
  // Suy ra ngay lúc vẽ (không cần effect): hết nội dung hoặc đứng dậy thì trình phát tắt. Component được dựng lại (key) mỗi lần ngồi,
  // nên ngồi lại không tự phát lại.
  const playing = sitting && ((chosen === 'video' && boardVideos.length > 0) || (chosen === 'music' && boardMusic.length > 0)) ? chosen : null
  const setPlaying = setChosen

  if (!sitting || (boardVideos.length === 0 && boardMusic.length === 0)) return null
  const src = playing === 'video' ? embedUrl(boardVideos) : playing === 'music' ? embedUrl(boardMusic) : null

  return (
    <section className="plaque hang-board" aria-label="Màn hình hội trường">
      <header>
        <strong>📺 Màn hình hội trường</strong>
        {playing ? (
          <button type="button" className="carved-btn carved-btn--ghost" onClick={() => setPlaying(null)}>
            Tắt
          </button>
        ) : null}
      </header>
      {src ? (
        <iframe
          className={playing === 'music' ? 'hang-board-audio' : 'hang-board-video'}
          title={playing === 'music' ? 'Nhạc hội trường' : 'Video hội trường'}
          src={src}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      ) : (
        <div className="hang-board-actions">
          {boardVideos.length > 0 ? (
            <button type="button" className="carved-btn carved-btn--primary" onClick={() => setPlaying('video')}>
              ▶ Phát video ({boardVideos.length})
            </button>
          ) : null}
          {boardMusic.length > 0 ? (
            <button type="button" className="carved-btn carved-btn--ghost" onClick={() => setPlaying('music')}>
              🎵 Phát nhạc ({boardMusic.length})
            </button>
          ) : null}
        </div>
      )}
      {!src ? <p className="hang-board-note">Nội dung do nhà cung cấp bên thứ ba phát; chỉ tải khi bạn bấm nút.</p> : null}
    </section>
  )
}
