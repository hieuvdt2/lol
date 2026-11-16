import test from 'node:test'
import assert from 'node:assert/strict'
import { horizontalFov, viewDistanceScale, viewFov } from '../../src/game/view.ts'

test('màn hình ngang/vuông giữ nguyên 55° và khoảng cách camera', () => {
  for (const a of [1, 1.33, 1.78, 2.4]) assert.deepEqual([viewFov(a), viewDistanceScale(a)], [55, 1])
})

test('màn hình dọc: góc nhìn nới dần (đơn điệu, có trần 78°), camera lùi dần, góc ngang không còn quá hẹp', () => {
  let fov = 55
  let dist = 1
  for (const a of [0.95, 0.8, 0.6, 0.46, 0.3, 0.1]) {
    assert.ok(viewFov(a) >= fov && viewFov(a) <= 78, `fov ${viewFov(a)} tại ${a}`)
    assert.ok(viewDistanceScale(a) >= dist)
    fov = viewFov(a)
    dist = viewDistanceScale(a)
  }
  assert.equal(viewFov(0.01), 78)
  assert.ok(viewDistanceScale(0.01) <= 1.25, 'không lùi quá xa')
  // điện thoại 390×844: trước khi sửa góc ngang chỉ ≈ 26°; giờ phải rộng hơn rõ rệt
  const aspect = 390 / 844
  assert.ok(horizontalFov(55, aspect) < 28)
  assert.ok(horizontalFov(viewFov(aspect), aspect) > 40, `${horizontalFov(viewFov(aspect), aspect).toFixed(1)}°`)
})

test('đầu vào lạ không sinh NaN', () => {
  for (const a of [0, -1, NaN]) {
    assert.ok(Number.isFinite(viewDistanceScale(a)) && Number.isFinite(viewFov(a)))
    assert.ok(viewFov(a) <= 78)
  }
})
