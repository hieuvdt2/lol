import { useEffect, useState, useSyncExternalStore } from 'react'
import { RESULT_TITLE } from '../game/duel.ts'
import type { NetClient } from '../game/net.ts'

function useNow(active: boolean, every = 100): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(performance.now()), every)
    return () => window.clearInterval(timer)
  }, [active, every])
  return now
}

export function DuelOverlay({ net }: { net: NetClient }) {
  const duel = net.duel
  const v = useSyncExternalStore(duel.subscribe, duel.getSnapshot)
  const now = useNow(v.phase !== 'idle')
  if (v.phase === 'idle') return null

  const pct = (hp: number) => `${Math.max(0, Math.min(100, (hp / v.rules.hp) * 100))}%`
  const left = Math.max(0, Math.ceil(((v.phase === 'countdown' ? v.goAt : v.endAt) - now) / 1000))
  const blockCd = Math.max(0, v.blockReady - now)
  const punchCd = Math.max(0, v.punchReady - now)
  const fighting = v.phase === 'fight'

  return (
    <div className="duel" data-hurt={v.hurtSeq % 2} role="dialog" aria-label="Giao lưu võ thuật">
      <div className="duel-bars">
        <div className="duel-side">
          <strong>{v.myName}</strong>
          <div className="duel-hp"><span style={{ width: pct(v.hpMe) }} /></div>
          <small>{v.hpMe}</small>
        </div>
        <div className="duel-clock">{v.phase === 'countdown' ? left || 'ĐẤM!' : v.phase === 'fight' ? left : '🥊'}</div>
        <div className="duel-side duel-side--peer">
          <strong>{v.peerName}</strong>
          <div className="duel-hp"><span style={{ width: pct(v.hpPeer) }} /></div>
          <small>{v.hpPeer}</small>
        </div>
      </div>

      {v.phase === 'countdown' ? <p className="duel-banner">Chuẩn bị… {left > 0 ? left : ''}</p> : null}
      {fighting && v.opp === 'windup' ? <p className="duel-banner duel-banner--warn">{v.peerName} gồng tay — ĐỠ NGAY!</p> : null}
      {v.taunt ? <p className="duel-taunt"><strong>{v.taunt.who}:</strong> {v.taunt.text}</p> : null}

      {fighting ? (
        <div className="duel-actions">
          <button type="button" className="carved-btn carved-btn--ghost" disabled={blockCd > 0 || v.confirmQuit} onClick={() => duel.block()}>
            🛡️ Đỡ <small className="kbd-hint">(K / chuột trái)</small>
          </button>
          <button type="button" className="carved-btn carved-btn--primary" disabled={punchCd > 0 || v.confirmQuit} onClick={() => duel.punch()}>
            👊 Đấm <small className="kbd-hint">(J / chuột phải)</small>
          </button>
        </div>
      ) : null}

      {v.phase !== 'ended' ? (
        <div className="duel-quit">
          {v.confirmQuit ? (
            <>
              <span>Bỏ cuộc là bị xử thua. Chắc chứ?</span>
              <button type="button" className="carved-btn carved-btn--primary" onClick={() => duel.quit()}>Bỏ cuộc</button>
              <button type="button" className="carved-btn carved-btn--ghost" onClick={() => duel.cancelQuit()}>Đánh tiếp</button>
            </>
          ) : (
            <button type="button" className="carved-btn carved-btn--ghost" onClick={() => duel.askQuit()}>Bỏ cuộc <span className="kbd-hint">(Esc)</span></button>
          )}
        </div>
      ) : null}

      {v.phase === 'ended' && v.end ? (
        <div className="plaque duel-end">
          <p className="plaque-kicker">{RESULT_TITLE[v.end.result]}</p>
          <p className="plaque-title">{v.end.won === null ? 'Hòa' : v.end.won ? 'Bạn thắng' : 'Bạn thua'}</p>
          <p>
            {v.end.won === null
              ? `${v.end.winner} và ${v.end.loser} bất phân thắng bại`
              : `${v.end.winner} thắng ${v.end.loser} (${v.end.hpWinner} – ${v.end.hpLoser})`}
          </p>
          <p>Đòn trúng: {v.end.hits} · Đỡ được: {v.end.blocks}</p>
          {v.rank.length > 0 ? (
            <ol className="duel-rank">
              {v.rank.map((r, i) => (
                <li key={`${i}-${r.name}`}>{r.name} · {r.wins} thắng</li>
              ))}
            </ol>
          ) : null}
          <button type="button" className="carved-btn carved-btn--primary" onClick={() => duel.close()}>Về hang</button>
        </div>
      ) : null}
    </div>
  )
}
