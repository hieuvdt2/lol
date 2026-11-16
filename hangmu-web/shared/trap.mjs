// Luật trò "Bẫy Độc Noxus" (dùng chung server + client + kiểm thử). Hai người, mỗi người một con đường ROWS hàng × COLS ô
// (2 ô trái/phải mỗi hàng, như cầu kính: theo góp ý "chỉ cần 2 ô" cho dễ chơi).
// 1) Giấu nấm: mỗi người cắm MUSHROOMS nấm lên đường của đối thủ (mỗi hàng tối đa MAX_PER_ROW để luôn còn lối đi).
// 2) Dò đường theo lượt: mỗi lượt cả hai bí mật chọn một ô ở hàng kế tiếp, lật cùng lúc (không ai lợi vì đi trước).
//    Ô an toàn: tiến lên một hàng. Dẫm nấm: mất 1 mạng, nấm lộ ra, đứng yên ở hàng đó (lượt sau chọn lại).
// 3) Tới đích trước thì thắng; hết mạng thì thua; cùng tới đích trong một lượt thì ai còn nhiều mạng hơn thắng, bằng nhau hoà.

export const TRAP = Object.freeze({
  rows: 6,
  cols: 2,
  mushrooms: 5,
  lives: 3,
  maxPerRow: 1,
  /** thời gian giấu nấm (ms) */
  placeMs: 40_000,
  /** thời gian mỗi lượt dò đường (ms) */
  turnMs: 15_000,
  /** nghỉ sau khi lật kết quả một lượt, cho hai bên xem (ms) */
  revealMs: 1_600,
})

export const cellOf = (row, col) => row * TRAP.cols + col
export const rowOf = (cell) => Math.floor(cell / TRAP.cols)
export const colOf = (cell) => cell % TRAP.cols

/** Cách cắm nấm hợp lệ: đúng số nấm, ô khác nhau, trong bảng, mỗi hàng không quá MAX_PER_ROW. */
export function validPlacement(cells) {
  if (!Array.isArray(cells) || cells.length !== TRAP.mushrooms) return false
  const seen = new Set()
  const perRow = new Map()
  for (const c of cells) {
    if (!Number.isInteger(c) || c < 0 || c >= TRAP.rows * TRAP.cols || seen.has(c)) return false
    seen.add(c)
    const n = (perRow.get(rowOf(c)) ?? 0) + 1
    if (n > TRAP.maxPerRow) return false
    perRow.set(rowOf(c), n)
  }
  return true
}

/** Bổ sung cho đủ số nấm (giữ các ô hợp lệ đã chọn, cắm ngẫu nhiên phần còn thiếu). */
export function completePlacement(partial, random = Math.random) {
  const cells = []
  const perRow = new Map()
  const add = (c) => {
    if (!Number.isInteger(c) || c < 0 || c >= TRAP.rows * TRAP.cols || cells.includes(c)) return
    if ((perRow.get(rowOf(c)) ?? 0) >= TRAP.maxPerRow || cells.length >= TRAP.mushrooms) return
    cells.push(c)
    perRow.set(rowOf(c), (perRow.get(rowOf(c)) ?? 0) + 1)
  }
  if (Array.isArray(partial)) partial.forEach(add)
  let guard = 0
  while (cells.length < TRAP.mushrooms && guard < 1000) {
    add(Math.floor(random() * TRAP.rows * TRAP.cols))
    guard += 1
  }
  return cells.sort((x, y) => x - y)
}

/**
 * Trận đấu thuần (không thời gian). `players`: hai mã người chơi. `board[p]`: các ô có nấm trên đường của p (do đối thủ cắm).
 */
export function createMatch(a, b) {
  return {
    players: [a, b],
    phase: 'place',
    round: 0,
    board: { [a]: null, [b]: null },
    row: { [a]: 0, [b]: 0 },
    lives: { [a]: TRAP.lives, [b]: TRAP.lives },
    /** nấm đã lộ (dẫm phải) trên đường của mỗi người */
    hit: { [a]: [], [b]: [] },
    /** các ô đã đi qua an toàn */
    path: { [a]: [], [b]: [] },
    pick: { [a]: null, [b]: null },
  }
}

export const foeOf = (m, p) => (m.players[0] === p ? m.players[1] : m.players[0])

/** `by` cắm nấm lên đường của đối thủ. Trả về false nếu không hợp lệ / sai giai đoạn / đã cắm. */
export function place(m, by, cells) {
  if (m.phase !== 'place' || !m.players.includes(by) || !validPlacement(cells)) return false
  const foe = foeOf(m, by)
  if (m.board[foe]) return false
  m.board[foe] = [...cells].sort((x, y) => x - y)
  return true
}

/** Hết giờ giấu nấm: ai chưa cắm thì cắm ngẫu nhiên; chuyển sang dò đường. */
export function startWalk(m, random = Math.random) {
  if (m.phase !== 'place') return false
  for (const p of m.players) if (!m.board[p]) m.board[p] = completePlacement([], random)
  m.phase = 'walk'
  m.round = 1
  return true
}

/** Các cột còn chọn được ở hàng kế tiếp của p (bỏ ô đã lộ nấm). */
export function openCols(m, p) {
  const row = m.row[p]
  const cols = []
  for (let c = 0; c < TRAP.cols; c += 1) if (!m.hit[p].includes(cellOf(row, c))) cols.push(c)
  return cols
}

/** p chọn cột cho lượt này (bí mật tới khi lật). */
export function pick(m, p, col) {
  if (m.phase !== 'walk' || !m.players.includes(p) || m.pick[p] !== null) return false
  if (!Number.isInteger(col) || !openCols(m, p).includes(col)) return false
  m.pick[p] = col
  return true
}

export const bothPicked = (m) => m.players.every((p) => m.pick[p] !== null)

/**
 * Lật kết quả lượt (ai chưa chọn thì chọn ngẫu nhiên một cột còn mở). Trả về danh sách bước và kết quả trận (null nếu chưa xong).
 * step: { p, row, col, hit }
 */
export function resolveRound(m, random = Math.random) {
  if (m.phase !== 'walk') return null
  const steps = []
  for (const p of m.players) {
    if (m.pick[p] === null) {
      const cols = openCols(m, p)
      m.pick[p] = cols[Math.floor(random() * cols.length)] ?? 0
    }
    const row = m.row[p]
    const col = m.pick[p]
    const cell = cellOf(row, col)
    const hit = m.board[p].includes(cell)
    if (hit) {
      m.lives[p] = Math.max(0, m.lives[p] - 1)
      if (!m.hit[p].includes(cell)) m.hit[p].push(cell)
    } else {
      m.path[p].push(cell)
      m.row[p] = row + 1
    }
    steps.push({ p, row, col, hit })
    m.pick[p] = null
  }
  const outcome = judge(m)
  if (outcome) m.phase = 'ended'
  else m.round += 1
  return { steps, outcome }
}

/** Kết quả trận sau một lượt: { winner: p | null, reason: 'goal' | 'dead' | 'draw' } hoặc null nếu chưa xong. */
export function judge(m) {
  const [a, b] = m.players
  const done = (p) => m.row[p] >= TRAP.rows
  const dead = (p) => m.lives[p] <= 0
  if (done(a) && done(b)) {
    if (m.lives[a] === m.lives[b]) return { winner: null, reason: 'draw' }
    return { winner: m.lives[a] > m.lives[b] ? a : b, reason: 'goal' }
  }
  if (done(a)) return { winner: a, reason: 'goal' }
  if (done(b)) return { winner: b, reason: 'goal' }
  if (dead(a) && dead(b)) return { winner: null, reason: 'draw' }
  if (dead(a)) return { winner: b, reason: 'dead' }
  if (dead(b)) return { winner: a, reason: 'dead' }
  return null
}
