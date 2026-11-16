// Phát hiện bản mới: so mã build đang chạy với /version.json trên server (do vite build phát hành).

/** Mã bản build đang chạy; 'dev' khi chạy dev server hoặc ngoài Vite (test). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__

type FetchLike = (url: string, init?: { cache?: 'no-store' }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

/** true nếu server đang phát hành một bản khác bản đang chạy. Lỗi mạng, JSON sai hay thiếu tệp đều coi là "không biết" (false). */
export async function checkForUpdate(fetchFn: FetchLike, current: string = BUILD_ID): Promise<boolean> {
  if (current === 'dev') return false // dev server không có version.json
  try {
    const response = await fetchFn(`/version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return false
    const body = (await response.json()) as { id?: unknown }
    return typeof body.id === 'string' && body.id.length > 0 && body.id !== current
  } catch {
    return false
  }
}

const DEFAULT_INTERVAL_MS = 60_000

/** Kiểm tra định kỳ và mỗi khi tab hiện lại; gọi `onNew` một lần duy nhất rồi dừng. Trả về hàm dừng. */
export function watchForUpdate(
  onNew: () => void,
  intervalMs: number = DEFAULT_INTERVAL_MS,
  fetchFn?: FetchLike,
  current: string = BUILD_ID,
): () => void {
  const get: FetchLike = fetchFn ?? ((url, init) => fetch(url, init))
  let stopped = false
  const check = () => {
    if (stopped) return
    void checkForUpdate(get, current).then((isNew) => {
      if (!isNew || stopped) return
      stopped = true
      onNew()
      cleanup()
    })
  }
  const timer = setInterval(check, intervalMs)
  const onVisible = () => !document.hidden && check()
  document.addEventListener('visibilitychange', onVisible)
  function cleanup() {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
  return () => {
    stopped = true
    cleanup()
  }
}
