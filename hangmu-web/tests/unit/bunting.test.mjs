import test from 'node:test'
import assert from 'node:assert/strict'
import { BUNTING_COLORS, buntingLayout } from '../../src/game/buntingLayout.ts'

test('bố trí cờ: nhiều dây, mỗi dây nhiều lá, màu đỏ/đen/trắng xen kẽ đều, xác định (cùng đầu vào → cùng kết quả)', () => {
  const a = buntingLayout()
  assert.deepEqual(a, buntingLayout())
  assert.equal(a.length, 7)
  const flags = a.flatMap((s) => s.pennants)
  assert.ok(flags.length > 150 && flags.length < 600, `${flags.length} lá (một lượt vẽ nên vẫn rẻ)`)
  const counts = [0, 1, 2].map((c) => flags.filter((f) => f.color === c).length)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join())
  assert.equal(BUNTING_COLORS.length, 3)
})

test('dây võng đúng: hai đầu ở mốc treo, giữa thấp nhất; mọi lá nằm dưới mốc treo và trong hang; không có số hỏng', () => {
  const height = 17.5
  const radius = 44
  for (const s of buntingLayout({ height, radius })) {
    const ys = s.points.map((p) => p[1])
    assert.ok(Math.abs(ys[0] - height) < 1e-9 && Math.abs(ys.at(-1) - height) < 1e-9)
    assert.ok(Math.min(...ys) < height - 2, 'có độ võng')
    const mid = ys[Math.floor(ys.length / 2)]
    assert.ok(Math.abs(mid - Math.min(...ys)) < 0.05, 'thấp nhất ở giữa')
    for (const f of s.pennants) {
      for (const v of [f.x, f.y, f.z, f.rotY]) assert.ok(Number.isFinite(v))
      assert.ok(f.y <= height + 1e-9 && f.y > height - 8)
      assert.ok(Math.hypot(f.x, f.z) <= radius + 1e-6, 'trong vòng mốc treo')
    }
  }
})

test('khoảng cách giữa các lá gần đều theo spacing; spacing nhỏ hơn thì nhiều lá hơn', () => {
  const s = buntingLayout({ spacing: 1.7 })[0]
  const gaps = s.pennants.slice(1).map((f, i) => Math.hypot(f.x - s.pennants[i].x, f.z - s.pennants[i].z, f.y - s.pennants[i].y))
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  assert.ok(gaps.every((g) => Math.abs(g - mean) < mean * 0.15), `khoảng cách ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}`)
  assert.ok(buntingLayout({ spacing: 1 })[0].pennants.length > s.pennants.length)
})
