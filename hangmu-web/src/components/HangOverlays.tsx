import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { NetClient, NetState } from '../game/net.ts'

/** Màn chờ ngoài cửa / đang nối / bị đóng. */
export function StatusOverlay({ state, onRetry, onLeave }: { state: NetState; onRetry: () => void; onLeave: () => void }) {
  if (state.phase === 'inCave') return null
  return (
    <div className="hang-overlay" role="status">
      <div className="plaque hang-overlay-card">
        {state.phase === 'connecting' ? (
          <>
            <p className="plaque-title">Đang vào hang…</p>
            {state.retryIn ? <p>Hang đang bận, thử lại sau {state.retryIn}s</p> : null}
          </>
        ) : null}
        {state.phase === 'queued' ? (
          <>
            <p className="plaque-title">Chờ ngoài cửa</p>
            <p>
              Bạn đứng thứ <strong>{state.position}</strong> · {state.waiting ?? 0} người chờ · {state.inRoom ?? 0} người trong hang
            </p>
          </>
        ) : null}
        {state.phase === 'closed' ? (
          <>
            <p className="plaque-title">Ra khỏi hang</p>
            <p>{state.error ?? 'Đã rời hang.'}</p>
            <button type="button" className="carved-btn carved-btn--primary" onClick={onRetry}>
              Vào hang
            </button>
          </>
        ) : null}
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onLeave}>
          Về sảnh
        </button>
      </div>
    </div>
  )
}

/** Dải báo mất mạng / mạng chập chờn. */
export function ConnectionBanner({ state }: { state: NetState }) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!state.reconnectUntil) return
    const tick = () => setLeft(Math.max(0, Math.ceil((state.reconnectUntil - performance.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 500)
    return () => window.clearInterval(timer)
  }, [state.reconnectUntil])
  if (state.reconnectUntil) return <p className="hang-banner hang-banner--bad">Mất kết nối, đang nối lại… còn {left}s</p>
  if (state.unstable) return <p className="hang-banner">Mạng đang chập chờn…</p>
  return null
}

/** Thanh mời giao lưu (đi và đến) + thông báo ngắn. */
export function InviteBar({ net, state }: { net: NetClient; state: NetState }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!state.asking && !state.invite) return
    const timer = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(timer)
  }, [state.asking, state.invite])
  const secs = (until: number) => Math.max(0, Math.ceil((until - now) / 1000))
  return (
    <div className="hang-invites">
      {state.toast ? <p className="hang-toast">{state.toast}</p> : null}
      {state.asking ? (
        <div className="plaque hang-invite">
          <p>
            Đang mời <strong>{state.asking.name}</strong> {state.asking.kind === 'duel' ? 'giao lưu võ thuật' : state.asking.kind === 'trap' ? 'chơi Bẫy Độc Noxus' : 'giao lưu mồm'}… {secs(state.asking.until)}s
          </p>
          <button type="button" className="carved-btn carved-btn--ghost" onClick={() => net.cancelAsk()}>
            Hủy
          </button>
        </div>
      ) : null}
      {state.invite ? (
        <div className="plaque hang-invite" role="alertdialog" aria-label="Lời mời giao lưu">
          <p>
            <strong>{state.invite.name}</strong>{' '}
            {state.invite.kind === 'duel'
              ? 'muốn giao lưu võ thuật. Đồng ý thì vào sàn đấu 30 giây, tay trái đỡ, tay phải đấm. Ai còn nhiều máu hơn thì thắng'
              : state.invite.kind === 'trap'
                ? 'thách bạn chơi 🍄 Bẫy Độc Noxus: mỗi người giấu 5 nấm trên đường đối thủ, rồi dò đường về đích. Dẫm nấm mất 1 mạng, có 3 mạng. Về đích trước thì thắng, cả hang sẽ biết'
                : 'muốn giao lưu mồm. Đồng ý thì cả hai đứng yên chat riêng, cả hang không đọc được'}{' '}
            · {secs(state.invite.until)}s
          </p>
          <div className="hang-invite-actions">
            <button type="button" className="carved-btn carved-btn--primary" onClick={() => net.answer(true)}>
              Đồng ý
            </button>
            <button type="button" className="carved-btn carved-btn--ghost" onClick={() => net.answer(false)}>
              Từ chối
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Khung chat riêng. */
export function TalkPanel({ net, state }: { net: NetClient; state: NetState }) {
  const conv = state.conv
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState(false)
  const end = useRef<HTMLLIElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [conv?.messages.length])
  if (!conv) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (net.sendDm(draft)) setDraft('')
  }
  const why = conv.ended?.reason === 'left' ? 'đã rời hang' : conv.ended?.reason === 'idle' ? 'cuộc trò chuyện đã im quá lâu' : conv.ended?.byMe ? 'bạn đã kết thúc' : 'đã kết thúc'
  return (
    <section className="plaque hang-talk" aria-label={`Chat riêng với ${conv.name}`}>
      <header>
        <strong>💬 {conv.name}</strong>
        {conv.ended ? (
          <button type="button" className="carved-btn carved-btn--ghost" onClick={() => net.dismissTalk()}>
            Đóng
          </button>
        ) : (
          <button type="button" className="carved-btn carved-btn--ghost" onClick={() => (confirm ? (net.endTalk(), setConfirm(false)) : setConfirm(true))}>
            {confirm ? 'Chắc chắn kết thúc?' : 'Kết thúc'}
          </button>
        )}
      </header>
      <ul>
        {conv.messages.map((m) => (
          <li key={m.key} className={m.mine ? 'mine' : ''} data-failed={m.failed || undefined} data-pending={m.pending || undefined}>
            {m.text}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ul>
      {conv.ended ? (
        <p className="hang-talk-end">Cuộc trò chuyện {why}.</p>
      ) : (
        <form onSubmit={submit}>
          <input value={draft} maxLength={400} placeholder="Nói riêng với anh em" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="carved-btn carved-btn--primary">
            Gửi
          </button>
        </form>
      )}
    </section>
  )
}

/** Bình chọn do server phát. */
export function PollCard({ net, state }: { net: NetClient; state: NetState }) {
  const poll = state.poll
  if (!poll) return null
  return (
    <section className="plaque hang-poll" aria-label="Bình chọn">
      <p>
        <strong>🗳️ {poll.q}</strong>
      </p>
      {state.pollVoted ? (
        <p>Đã ghi nhận phiếu của bạn.</p>
      ) : (
        <div>
          {poll.options.map((option, index) => (
            <button key={option} type="button" className="carved-btn carved-btn--ghost" onClick={() => net.vote(index)}>
              {option}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** Nháy đỏ khi bị đấm. */
export function PunchFlash({ state }: { state: NetState }) {
  const [shown, setShown] = useState<string | null>(null)
  const seq = state.punched?.seq
  const by = state.punched?.by
  useEffect(() => {
    if (!seq) return
    setShown(by ?? null)
    const timer = window.setTimeout(() => setShown(null), 1400)
    return () => window.clearTimeout(timer)
  }, [seq, by])
  return shown ? (
    <>
      <div key={seq} className="hang-punched-vignette" aria-hidden="true" />
      <p className="hang-punched">👊 {shown} vừa đấm bạn</p>
    </>
  ) : null
}
