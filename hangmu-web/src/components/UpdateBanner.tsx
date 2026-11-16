import { useEffect, useState } from 'react'
import { watchForUpdate } from '../version.ts'

/** Dải "có bản mới · Tải lại" (không tự tải lại: người dùng có thể đang ở giữa trận). */
export function UpdateBanner() {
  const [hasNew, setHasNew] = useState(false)
  useEffect(() => {
    const override = Number((window as unknown as { __HANGMU_VERSION_POLL_MS?: number }).__HANGMU_VERSION_POLL_MS)
    return watchForUpdate(() => setHasNew(true), Number.isFinite(override) && override > 0 ? override : undefined)
  }, [])
  if (!hasNew) return null
  return (
    <div className="update-banner" role="status">
      <span>Có bản mới</span>
      <button type="button" onClick={() => window.location.reload()}>
        Tải lại
      </button>
    </div>
  )
}
