import { useEffect, useSyncExternalStore } from 'react'
import { RESULT_TITLE } from '../game/duel.ts'
import { noticeQueue } from '../game/noticeStore.ts'
import { NOTICE_ICON, noticeSegments, noticeSub } from '../game/notices.ts'

/** Thông báo nổi bật giữa phía trên màn hình: ai vừa vào hang / vào Telegram, kết quả giao lưu võ thuật. Từng cái một, tự tắt sau ~6 giây. */
export function NoticeToast() {
  const notice = useSyncExternalStore(noticeQueue.subscribe, noticeQueue.getSnapshot)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) noticeQueue.pump()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      noticeQueue.reset()
    }
  }, [])
  if (!notice) return null
  const sub = noticeSub(notice, (r) => RESULT_TITLE[r])
  return (
    <div key={notice.id} className="hang-event" role="status" aria-live="polite" data-kind={notice.kind}>
      <span className="hang-event-icon" aria-hidden="true">{NOTICE_ICON[notice.kind]}</span>
      <div>
        <p className="hang-event-text">
          {noticeSegments(notice).map((seg, i) => (seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>))}
        </p>
        {sub ? <p className="hang-event-sub">{sub}</p> : null}
      </div>
    </div>
  )
}
