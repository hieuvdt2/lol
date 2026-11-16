// Luật "Bẫy Độc Noxus" (shared/trap.mjs): 6 hàng × 2 ô (trái/phải), 5 nấm, mỗi hàng tối đa 1 nấm, 3 mạng.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TRAP, cellOf, completePlacement, createMatch, judge, openCols, pick, place, resolveRound, startWalk, validPlacement } from '../../shared/trap.mjs'
import { draftToggle } from '../../src/game/trap.ts'

const seq = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const col0 = (rows = [0, 1, 2, 3, 4]) => rows.map((r) => cellOf(r, 0))
const col1 = (rows = [0, 1, 2, 3, 4]) => rows.map((r) => cellOf(r, 1))

test('bảng 6 hàng × 2 ô; cắm nấm: đúng 5 ô khác nhau, trong bảng, mỗi hàng tối đa 1 (luôn còn lối đi)', () => {
  assert.equal(TRAP.cols, 2)
  assert.equal(TRAP.maxPerRow, 1)
  assert.equal(validPlacement(col0()), true)
  assert.equal(validPlacement([cellOf(0, 0), cellOf(0, 1), cellOf(1, 0), cellOf(2, 0), cellOf(3, 0)]), false, '2 nấm một hàng: chặn hết lối')
  assert.equal(validPlacement([0, 0, 2, 4, 6]), false, 'trùng ô')
  assert.equal(validPlacement(col0([0, 1, 2, 3])), false, 'thiếu nấm')
  assert.equal(validPlacement([0, 2, 4, 6, TRAP.rows * TRAP.cols]), false, 'ngoài bảng')
  const r = seq()
  for (let i = 0; i < 200; i += 1) assert.equal(validPlacement(completePlacement([], r)), true)
})

test('giấu nấm trên giao diện: bấm ô kia cùng hàng thì nấm chuyển sang (đổi bên); bấm lại thì nhổ; quá 5 nấm thì báo', () => {
  let d = draftToggle([], cellOf(0, 0)).draft
  d = draftToggle(d, cellOf(0, 1)).draft
  assert.deepEqual(d, [cellOf(0, 1)], 'đổi bên trong cùng hàng')
  assert.deepEqual(draftToggle(d, cellOf(0, 1)).draft, [], 'nhổ lên')
  const full = col0()
  assert.match(draftToggle(full, cellOf(5, 0)).why, /Chỉ có 5 nấm/)
  assert.deepEqual(draftToggle(full, cellOf(2, 1)).draft.sort((a, b) => a - b), [cellOf(0, 0), cellOf(1, 0), cellOf(2, 1), cellOf(3, 0), cellOf(4, 0)].sort((a, b) => a - b), 'đủ 5 nấm vẫn đổi bên được')
})

test('mỗi người cắm lên đường của đối thủ; chỉ cắm một lần; hết giờ thì máy cắm hộ người chưa cắm', () => {
  const m = createMatch(1, 2)
  assert.equal(place(m, 1, col0()), true)
  assert.deepEqual(m.board[2], col0(), 'nấm của người 1 nằm trên đường người 2')
  assert.equal(place(m, 1, col1()), false, 'không cắm lại')
  assert.equal(pick(m, 1, 0), false, 'chưa tới lượt dò đường')
  startWalk(m, seq())
  assert.equal(m.phase, 'walk')
  assert.equal(validPlacement(m.board[1]), true, 'người 2 chưa cắm: máy cắm hộ')
})

test('dò đường: ô an toàn thì tiến, dẫm nấm thì mất mạng, nấm lộ ra, đứng yên; ô đã lộ không chọn lại; cột ngoài bảng bị chặn', () => {
  const m = createMatch(1, 2)
  place(m, 1, col0()) // đường của 2
  place(m, 2, col0()) // đường của 1
  startWalk(m)
  assert.equal(pick(m, 1, 2), false, 'chỉ có 2 ô')
  assert.equal(pick(m, 1, 1), true)
  assert.equal(pick(m, 1, 0), false, 'đã chọn trong lượt')
  assert.equal(pick(m, 2, 0), true)
  const r = resolveRound(m)
  assert.deepEqual(r.steps, [{ p: 1, row: 0, col: 1, hit: false }, { p: 2, row: 0, col: 0, hit: true }])
  assert.equal(m.row[1], 1)
  assert.equal(m.row[2], 0, 'dẫm nấm: đứng yên')
  assert.equal(m.lives[2], TRAP.lives - 1)
  assert.deepEqual(openCols(m, 2), [1], 'ô đã lộ nấm không chọn được nữa')
  assert.equal(r.outcome, null)
  assert.equal(m.round, 2)
})

test('tới đích trước thì thắng; hết mạng thì thua; cùng tới đích thì ai nhiều mạng hơn thắng, bằng nhau hoà', () => {
  const m = createMatch(1, 2)
  place(m, 1, col0()) // đường 2: cột 0 nấm
  place(m, 2, col0()) // đường 1: cột 0 nấm → 1 đi cột 1 an toàn
  startWalk(m)
  let out = null
  for (let i = 0; i < 20 && !out; i += 1) {
    pick(m, 1, 1)
    pick(m, 2, i === 0 ? 0 : 1) // 2 dẫm 1 lần rồi đi cột 1 (chậm 1 lượt)
    out = resolveRound(m).outcome
  }
  assert.deepEqual(out, { winner: 1, reason: 'goal' })
  assert.equal(m.phase, 'ended')
  const dead = createMatch(1, 2)
  dead.lives[2] = 0
  assert.deepEqual(judge(dead), { winner: 1, reason: 'dead' })
  const tie = createMatch(1, 2)
  tie.row[1] = tie.row[2] = TRAP.rows
  assert.deepEqual(judge(tie), { winner: null, reason: 'draw' })
  tie.lives[2] = 1
  assert.deepEqual(judge(tie), { winner: 1, reason: 'goal' })
  const goalBeatsDead = createMatch(1, 2)
  goalBeatsDead.row[1] = TRAP.rows
  goalBeatsDead.lives[2] = 0
  assert.deepEqual(judge(goalBeatsDead), { winner: 1, reason: 'goal' })
})

test('không chọn trong lượt: máy chọn ngẫu nhiên ô chưa lộ nấm; luôn còn lối đi nên trận luôn kết thúc', () => {
  const r = seq(3)
  for (let g = 0; g < 100; g += 1) {
    const m = createMatch(1, 2)
    startWalk(m, r)
    let out = null
    let rounds = 0
    while (!out) {
      const res = resolveRound(m, r)
      out = res.outcome
      rounds += 1
      for (const s of res.steps) assert.ok(s.col >= 0 && s.col < TRAP.cols)
      assert.ok(rounds < 50, 'không kẹt')
    }
  }
})
