// Bố cục khán đài (layout.ts + shared/world.mjs): bậc, cung, khoảng trống, lối đi.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STANDS, STANDS_OUTER, STAND_GAPS, inStandGap, standArcs } from '../../src/game/layout.ts'
import { AISLE_ANGLES, CAVE_RADIUS, STAND_BENCHES, STAGE, WALK_RADIUS } from '../../shared/world.mjs'

test('khán đài nằm trong vách hang và dưới vòm trần; vòng đi bộ phủ tới bậc trên cùng', () => {
  assert.ok(STANDS_OUTER < CAVE_RADIUS - 2, `khán đài (r=${STANDS_OUTER.toFixed(1)}) không đâm vào vách`)
  const ceiling = 30 * Math.sqrt(1 - (WALK_RADIUS / CAVE_RADIUS) ** 2)
  const top = STANDS.tiers * STANDS.rise
  assert.ok(top + 2.2 < ceiling, `đủ khoảng trống đầu cho người đứng trên bậc cao nhất: đỉnh ${top}, trần ${ceiling.toFixed(1)}`)
  assert.ok(STANDS.rise <= 0.9, 'bậc không quá cao để trông như bậc thang')
})

test('băng ghế khán đài: không nằm trong khoảng trống; khu sân khấu hội trường và lối vào trống', () => {
  assert.ok(STAND_BENCHES.every((b) => !inStandGap(Math.atan2(b.x, b.z))))
  assert.ok(STAND_BENCHES.every((b) => !(Math.abs(b.x) < 14 && b.z < STAGE.z + 6)), 'sân khấu hội trường trống')
  assert.ok(STAND_BENCHES.every((b) => !(Math.abs(b.x) < 7 && b.z > 0)), 'lối vào trống')
})

test('standArcs: phủ phần còn lại của vòng tròn sau khi trừ các khoảng trống; cả sáu cầu thang đều nằm trong cung có khán đài', () => {
  const arcs = standArcs()
  const total = arcs.reduce((sum, [, length]) => sum + length, 0)
  const gaps = STAND_GAPS.reduce((sum, [, half]) => sum + half * 2, 0)
  assert.ok(Math.abs(total + gaps - Math.PI * 2) < 1e-9, `cung ${total} + khe ${gaps} ≠ 2π`)
  assert.equal(AISLE_ANGLES.length, 6)
  for (const a of AISLE_ANGLES) assert.ok(!inStandGap(a), `lối đi ${a} rơi vào khoảng trống`)
})
