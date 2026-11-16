// Màn hình hội trường: danh sách video / nhạc do server phát (thông điệp `board`).

/** Giới hạn số mục mỗi danh sách (khớp giới hạn của client gốc: 200). */
export const BOARD_MAX_IDS = 200

/** [INFERRED] Hình dạng định danh video: chuỗi 6–20 ký tự chữ/số/gạch ngang/gạch dưới. Chặt để ghép vào URL nhúng an toàn. */
const ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/

/** Lọc các mục hợp lệ, bỏ trùng, giữ thứ tự, tối đa BOARD_MAX_IDS. Không phải mảng thì trả mảng rỗng. */
export function parseBoardIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item === 'string' && ID_PATTERN.test(item) && !seen.has(item)) {
      seen.add(item)
      if (seen.size >= BOARD_MAX_IDS) break
    }
  }
  return [...seen]
}

export interface BoardContent {
  videos: string[]
  music: string[]
}

/** Đọc thông điệp `board`; chấp nhận cả trường `video` đơn lẻ (kiểu cũ) khi không có `videos`. */
export function parseBoard(message: Record<string, unknown>): BoardContent {
  const videos = parseBoardIds(Array.isArray(message.videos) ? message.videos : [message.video])
  return { videos, music: parseBoardIds(message.music) }
}

/** Rút ID video từ đường dẫn YouTube dán vào (watch?v=, youtu.be/, embed/, shorts/, live/) hoặc chính ID trần. Không hợp lệ thì trả null. */
export function parseYoutubeLink(text: string): string | null {
  const input = text.trim()
  if (!input || input.length > 300) return null
  if (ID_PATTERN.test(input) && !input.includes('.')) return input
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const [, kind, value] = url.pathname.split('/')
      if (kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v') id = value ?? null
    }
  }
  return id && ID_PATTERN.test(id) ? id : null
}

/**
 * URL nhúng trình phát (dạng không dùng cookie). Danh sách rỗng thì trả null.
 * `api`: bật điều khiển từ trang (postMessage) và ẩn thanh điều khiển của YouTube, dùng cho màn hình lớn trong cảnh 3D.
 */
export function embedUrl(ids: readonly string[], { autoplay = true, api = false, origin }: { autoplay?: boolean; api?: boolean; origin?: string } = {}): string | null {
  const [first, ...rest] = ids
  if (!first || !ID_PATTERN.test(first)) return null
  const params = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1' })
  if (autoplay) params.set('autoplay', '1')
  if (api) {
    params.set('enablejsapi', '1')
    params.set('controls', '0')
    params.set('disablekb', '1')
    params.set('fs', '0')
    if (origin) params.set('origin', origin)
  }
  const queue = rest.filter((id) => ID_PATTERN.test(id)).slice(0, BOARD_MAX_IDS - 1)
  if (queue.length > 0) params.set('playlist', queue.join(','))
  return `https://www.youtube-nocookie.com/embed/${first}?${params.toString().replaceAll('%2C', ',')}`
}
