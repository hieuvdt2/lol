// Lớp phủ trò "Bẫy Độc Noxus": hai làn đường 6×3. Làn của mình (dò đường) và làn của đối thủ (giấu nấm / xem đối thủ dò).
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { NetClient } from '../game/net.ts'
import type { Lane, TrapView } from '../game/trap.ts'
import { TRAP, cellOf } from '../../shared/trap.mjs'

/** Cây nấm độc tự vẽ (mũ tím chấm xanh, thân kem). */
export function Shroom({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 34 C23 44 22 52 26 56 L38 56 C42 52 41 44 40 34 Z" fill="#f3e6c8" stroke="#7a5b3a" strokeWidth="2" />
      <path d="M6 34 C6 16 20 6 32 6 C44 6 58 16 58 34 C50 38 14 38 6 34 Z" fill="#8b2fc9" stroke="#3d0f5c" strokeWidth="2.5" />
      <circle cx="20" cy="22" r="4.5" fill="#b8ff4f" />
      <circle cx="35" cy="14" r="3.5" fill="#b8ff4f" />
      <circle cx="44" cy="25" r="5" fill="#b8ff4f" />
      <circle cx="29" cy="28" r="3" fill="#b8ff4f" />
    </svg>
  )
}

const secsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000))
const hearts = (n: number) => '❤'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, TRAP.lives - n))

type CellState = { mushroom?: 'draft' | 'mine' | 'hidden' | 'hit'; path?: boolean; next?: boolean; picked?: boolean; fresh?: 'hit' | 'safe'; token?: boolean }

function laneCells(v: TrapView, who: 'me' | 'foe'): Map<number, CellState> {
  const lane: Lane = who === 'me' ? v.me : v.foe
  const map = new Map<number, CellState>()
  const at = (c: number) => {
    let s = map.get(c)
    if (!s) map.set(c, (s = {}))
    return s
  }
  for (const c of lane.path) at(c).path = true
  if (who === 'foe') {
    for (const c of v.phase === 'place' && !v.placed ? v.draft : v.mine) at(c).mushroom = v.phase === 'place' && !v.placed ? 'draft' : 'mine'
  } else if (v.end) {
    for (const c of v.end.trapsOnMe) at(c).mushroom = 'hidden' // hết trận: lộ hết nấm trên đường mình
  }
  for (const c of lane.hits) at(c).mushroom = 'hit'
  if (v.phase === 'walk' && lane.row < TRAP.rows) for (let col = 0; col < TRAP.cols; col += 1) at(cellOf(lane.row, col)).next = true
  if (who === 'me' && v.myPick !== null) at(cellOf(lane.row, v.myPick)).picked = true
  for (const s of v.last.steps) if (s.me === (who === 'me')) at(cellOf(s.row, s.col)).fresh = s.hit ? 'hit' : 'safe'
  const last = lane.path.at(-1)
  if (last !== undefined) at(last).token = true
  return map
}

function LaneView({ v, who, title, caption, active, onCell, foeName, now }: { v: TrapView; who: 'me' | 'foe'; title: string; caption: string; active: boolean; onCell?: (cell: number, col: number) => void; foeName: string; now: number }) {
  const lane = who === 'me' ? v.me : v.foe
  const cells = laneCells(v, who)
  const rows = Array.from({ length: TRAP.rows }, (_, i) => TRAP.rows - 1 - i) // đích ở trên
  const done = lane.row >= TRAP.rows
  const clickable = (row: number, col: number) => {
    if (!onCell) return false
    if (who === 'foe') return v.phase === 'place' && !v.placed
    return v.phase === 'walk' && v.myPick === null && row === v.me.row && !v.me.hits.includes(cellOf(row, col)) && now >= v.revealUntil
  }
  const tag = who === 'me' ? 'Bạn' : foeName.slice(0, 8)
  return (
    <section className="trap-lane" data-who={who} data-active={active || undefined} aria-label={title}>
      <header className="trap-lane-head">
        <span className="trap-badge">{who === 'me' ? '🧍 BẠN' : '🎯 ĐỐI THỦ'}</span>
        <strong>{title}</strong>
        <span className="trap-hearts" aria-label={`${lane.lives} mạng`}>{hearts(lane.lives)}</span>
      </header>
      {caption ? <p className="trap-caption">{caption}</p> : null}
      <div className="trap-goal" data-done={done || undefined}>🏁 ĐÍCH{done ? ' — tới nơi!' : ''}</div>
      <div className="trap-grid" role="grid" style={{ ['--cols' as string]: TRAP.cols }}>
        {rows.map((row) => (
          <div className="trap-row" role="row" key={row} data-next={(v.phase === 'walk' && row === lane.row) || undefined}>
            {Array.from({ length: TRAP.cols }, (_, col) => {
              const cell = cellOf(row, col)
              const s = cells.get(cell) ?? {}
              const can = clickable(row, col)
              const side = TRAP.cols === 2 ? (col === 0 ? 'trái' : 'phải') : `${col + 1}`
              const label = `Hàng ${row + 1}, ô ${side}${s.mushroom === 'hit' ? ', nấm đã dẫm' : s.mushroom ? ', có nấm' : ''}${s.path ? ', đã đi qua' : ''}`
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={`${cell}:${s.fresh ? v.last.seq : 0}`}
                  className="trap-cell"
                  data-cell={cell}
                  data-mushroom={s.mushroom}
                  data-path={s.path || undefined}
                  data-next={s.next || undefined}
                  data-picked={s.picked || undefined}
                  data-fresh={s.fresh}
                  disabled={!can}
                  aria-label={label}
                  onClick={() => can && onCell?.(cell, col)}
                >
                  {s.mushroom ? <Shroom className="trap-shroom" /> : s.path ? <span className="trap-foot">👣</span> : null}
                  {s.token ? <span className="trap-token">{tag}</span> : null}
                  {s.next && who === 'me' && can ? <span className="trap-key">{col + 1}</span> : null}
                  {s.fresh === 'hit' ? <span className="trap-cloud" aria-hidden="true" /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="trap-start">{lane.path.length === 0 ? <span className="trap-token trap-token--start">{tag}</span> : null} XUẤT PHÁT</div>
    </section>
  )
}

export function TrapOverlay({ net }: { net: NetClient }) {
  const v = useSyncExternalStore(net.trap.subscribe, net.trap.getSnapshot)
  const [tip, setTip] = useState<string | null>(null)
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (v.phase === 'idle') return
    const timer = window.setInterval(() => setNow(performance.now()), 200) // đồng hồ đếm ngược + mở khoá sau khi xem kết quả lượt
    return () => window.clearInterval(timer)
  }, [v.phase])
  // trạng thái vừa đổi (lượt mới, lật bài...) thì cập nhật đồng hồ ngay, không chờ nhịp 200 ms
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setNow(performance.now()))
    return () => window.cancelAnimationFrame(id)
  }, [v])
  useEffect(() => {
    if (!tip) return
    const timer = window.setTimeout(() => setTip(null), 2600)
    return () => window.clearTimeout(timer)
  }, [tip])
  if (v.phase === 'idle') return null
  const foe = v.peerName
  const left = secsLeft(v.deadline, now)
  const pct = Math.max(0, Math.min(100, ((v.deadline - now) / v.span) * 100))
  const viewing = now < v.revealUntil
  const status =
    v.phase === 'place'
      ? v.placed
        ? `Đã giấu xong. ${v.foePlaced ? 'Bắt đầu ngay…' : `Chờ ${foe} giấu nấm…`}`
        : `Giấu nấm lên đường của ${foe}${v.foePlaced ? ` · ${foe} đã giấu xong` : ''}`
      : v.phase === 'walk'
        ? viewing
          ? 'Lật bài…'
          : v.me.row >= TRAP.rows
            ? 'Bạn đã tới đích!'
            : v.myPick !== null
              ? `Đã chọn ô ${v.myPick + 1}. ${v.foeLocked ? 'Lật bài…' : `Chờ ${foe} chọn…`}`
              : `Lượt ${v.round}: tới lượt bạn bước${v.foeLocked ? ` · ${foe} đã chọn` : ''}`
        : ''
  const end = v.end
  const endTitle = !end ? '' : end.won === null ? 'HOÀ' : end.won ? '🏆 BẠN THẮNG!' : 'THUA RỒI'
  const endWhy = !end
    ? ''
    : end.reason === 'goal'
      ? end.won ? 'Bạn về đích trước.' : `${foe} về đích trước.`
      : end.reason === 'dead'
        ? end.won ? `${foe} dẫm hết ${TRAP.lives} mạng.` : `Bạn dẫm nấm hết ${TRAP.lives} mạng.`
        : end.reason === 'draw'
          ? 'Hai bên ngang tài ngang sức.'
          : end.won ? `${foe} bỏ chạy khỏi bãi nấm.` : 'Bạn đã bỏ cuộc.'
  return (
    <div className="trap-backdrop">
      <section className="trap" role="dialog" aria-label="Bẫy Độc Noxus" data-phase={v.phase}>
        <header className="trap-head">
          <h2>
            <Shroom className="trap-title-shroom" /> Bẫy Độc Noxus <small>vs {foe}</small>
          </h2>
          {v.phase !== 'ended' ? (
            <button type="button" className="carved-btn carved-btn--ghost trap-quit" onClick={() => net.trap.askQuit()}>
              Bỏ cuộc
            </button>
          ) : null}
        </header>
        {v.phase !== 'ended' ? (
          <div className="trap-status">
            <p aria-live="polite">{status}</p>
            <div className="trap-timer" aria-label={`Còn ${left} giây`}>
              <span style={{ width: `${pct}%` }} data-low={left <= 5 || undefined} />
              <b>{left}s</b>
            </div>
          </div>
        ) : null}
        <div className="trap-lanes" data-focus={v.phase === 'place' ? 'foe' : 'me'}>
          <LaneView
            v={v}
            who="me"
            now={now}
            active={v.phase !== 'place'}
            title="Đường của bạn"
            caption={
              v.phase === 'place'
                ? `${foe} đang giấu nấm trên đường này…`
                : v.phase === 'walk'
                  ? v.me.row >= TRAP.rows ? 'Bạn đã tới đích!' : `Chọn ô ${TRAP.cols === 2 ? 'trái / phải' : ''} ở hàng sáng (phím 1–${TRAP.cols}) — tránh nấm ${foe} giấu`
                  : 'Nấm đối thủ giấu trên đường bạn đã lộ hết'
            }
            foeName={foe}
            onCell={(_, col) => net.trap.step(col)}
          />
          <LaneView
            v={v}
            who="foe"
            now={now}
            active={v.phase === 'place'}
            title={`Đường của ${foe}`}
            caption={
              v.phase === 'place'
                ? v.placed
                  ? `Đã giấu ${TRAP.mushrooms} nấm. Chờ ${foe}…`
                  : `Bấm ô để giấu nấm · còn ${TRAP.mushrooms - v.draft.length} nấm · mỗi hàng ${TRAP.maxPerRow} nấm`
                : v.phase === 'walk'
                  ? `${foe} đang dò đường · 🍄 mờ = nấm bạn giấu`
                  : ''
            }
            foeName={foe}
            onCell={(cell) => {
              const why = net.trap.toggleDraft(cell)
              if (why) setTip(why)
            }}
          />
        </div>
        {v.phase === 'place' && !v.placed ? (
          <div className="trap-actions">
            <button type="button" className="carved-btn carved-btn--ghost" onClick={() => net.trap.clearDraft()} disabled={v.draft.length === 0}>
              Nhổ hết
            </button>
            <button type="button" className="carved-btn carved-btn--primary trap-confirm" onClick={() => net.trap.confirmPlace()} disabled={v.draft.length !== TRAP.mushrooms}>
              Giấu nấm xong ({v.draft.length}/{TRAP.mushrooms})
            </button>
          </div>
        ) : null}
        {tip ? <p className="trap-tip" role="alert">{tip}</p> : null}
        {v.confirmQuit ? (
          <div className="trap-confirm-quit plaque" role="alertdialog" aria-label="Bỏ cuộc?">
            <p>Bỏ cuộc thì xử thua, cả hang sẽ biết. Chắc chưa?</p>
            <div className="hang-invite-actions">
              <button type="button" className="carved-btn carved-btn--primary" onClick={() => net.trap.quit()}>Bỏ cuộc</button>
              <button type="button" className="carved-btn carved-btn--ghost" onClick={() => net.trap.cancelQuit()}>Chơi tiếp</button>
            </div>
          </div>
        ) : null}
        {end ? (
          <div className="trap-end" data-won={end.won === null ? 'draw' : String(end.won)}>
            <strong>{endTitle}</strong>
            <p>{endWhy} Còn {v.me.lives} ❤ · {foe} còn {v.foe.lives} ❤. Nấm trên đường bạn đã lộ hết.</p>
            <button type="button" className="carved-btn carved-btn--primary" onClick={() => net.trap.close()}>
              Đóng
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
