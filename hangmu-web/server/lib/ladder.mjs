// Bảng "Võ công cao nhất hang": số trận thắng giao lưu võ thuật trong tuần, theo mã người dùng (hm_sid).
// Điều khoản gốc: lưu tên + số trận thắng tuần này kèm mã ngẫu nhiên, hiện top 8, làm mới mỗi thứ Hai, tự xoá sau ~8 ngày.
import { validSid, weekStart } from './accounts.mjs'

export const LADDER_TOP = 8
export const LADDER_KEEP_MS = 8 * 24 * 60 * 60 * 1000

/**
 * @param {{ max?: number, offsetHours?: number }} [options] max = số người tối đa được lưu (chặn phình bộ nhớ).
 */
export function createLadder({ max = 500, offsetHours = 7 } = {}) {
  /** @type {Map<string, { name: string, wins: number, week: number, at: number }>} */
  const map = new Map()
  const weekOf = (now) => weekStart(now, offsetHours)

  function evict(keep) {
    while (map.size > max) {
      let victim = null
      for (const [sid, rec] of map) {
        if (sid === keep) continue
        const v = victim === null ? null : map.get(victim)
        if (v === null || rec.week < v.week || (rec.week === v.week && (rec.wins < v.wins || (rec.wins === v.wins && rec.at < v.at)))) victim = sid
      }
      if (victim === null) return
      map.delete(victim)
    }
  }

  return {
    get size() {
      return map.size
    },
    /** Ghi một trận thắng cho người có mã `sid`. Sang tuần mới thì đếm lại từ 1. Trả về số trận thắng tuần này. */
    win(sid, name, now = Date.now()) {
      const week = weekOf(now)
      const rec = map.get(sid)
      if (rec && rec.week === week) {
        rec.wins += 1
        rec.name = name
        rec.at = now
        return rec.wins
      }
      map.set(sid, { name, wins: 1, week, at: now })
      evict(sid)
      return 1
    },
    /** Top n của tuần hiện tại: [[tên, số thắng], ...], cao xuống thấp; bằng nhau thì ai thắng trước xếp trước. */
    top(n = LADDER_TOP, now = Date.now()) {
      const week = weekOf(now)
      return [...map.values()]
        .filter((r) => r.week === week)
        .sort((a, b) => b.wins - a.wins || a.at - b.at)
        .slice(0, n)
        .map((r) => [r.name, r.wins])
    },
    /** Xoá bản ghi quá ~8 ngày kể từ trận thắng gần nhất. Trả về số đã xoá. */
    prune(now = Date.now()) {
      let removed = 0
      for (const [sid, rec] of map) {
        if (now - rec.at > LADDER_KEEP_MS) {
          map.delete(sid)
          removed += 1
        }
      }
      return removed
    },
    export() {
      return [...map.entries()].map(([sid, r]) => [sid, r.name, r.wins, r.week, r.at])
    },
    import(rows, now = Date.now()) {
      if (!Array.isArray(rows)) return
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const [sid, name, wins, week, at] = row
        if (!validSid(sid) || typeof name !== 'string' || name.length === 0 || !Number.isInteger(wins) || wins < 1 || !Number.isFinite(week) || !Number.isFinite(at)) continue
        if (now - at > LADDER_KEEP_MS) continue
        map.set(sid, { name: name.slice(0, 60), wins, week, at })
      }
      evict(null)
    },
  }
}
