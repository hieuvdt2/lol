import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { makeHeadGeometries } from '../../src/game/head.ts'

const R = 0.25
const OFFSET = 0.25 // tâm đầu cao hơn cổ

/** Hướng (đơn vị) từ tâm đầu tới điểm giữa ảnh (u = 0,5; v = 0,5) = hướng mặt nhìn. */
function faceDirection(geometry) {
  const uv = geometry.getAttribute('uv')
  const pos = geometry.getAttribute('position')
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < uv.count; i += 1) {
    const d = Math.hypot(uv.getX(i) - 0.5, uv.getY(i) - 0.5)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const v = new THREE.Vector3(pos.getX(best), pos.getY(best) - OFFSET, pos.getZ(best))
  return v.normalize()
}

test('MẶT hướng về +z (phía trước của thân), không lệch ngang', () => {
  const { head } = makeHeadGeometries(R, OFFSET)
  const f = faceDirection(head)
  assert.ok(f.z > 0.98, `mặt nhìn (${f.x.toFixed(2)}, ${f.y.toFixed(2)}, ${f.z.toFixed(2)}); phải gần (0, 0, 1)`)
  assert.ok(Math.abs(f.x) < 0.1)
  // đối chứng: hình cầu thô của three.js không quay thì mặt nhìn +x — đây chính là lỗi cũ
  const raw = new THREE.SphereGeometry(R, 18, 12)
  raw.translate(0, OFFSET, 0)
  assert.ok(faceDirection(raw).x > 0.98, 'hình cầu mặc định: mặt ở +x')
})

test('đầu và tóc cùng tâm (tóc phủ đỉnh đầu), nằm đúng trên cổ', () => {
  const { head, hair } = makeHeadGeometries(R, OFFSET)
  head.computeBoundingBox()
  hair.computeBoundingBox()
  const hc = head.boundingBox.getCenter(new THREE.Vector3())
  assert.ok(Math.abs(hc.y - OFFSET) < 1e-6 && Math.abs(hc.x) < 1e-6 && Math.abs(hc.z) < 1e-6)
  assert.ok(hair.boundingBox.max.y >= head.boundingBox.max.y - 1e-6, 'tóc phủ tới đỉnh đầu')
  assert.ok(Math.abs(hair.boundingBox.getCenter(new THREE.Vector3()).x) < 1e-3, 'tóc cân giữa')
})

test('nghiêng/quay đầu quanh cổ: đầu không rời khỏi thân (quanh gốc chân thì văng cả mét)', () => {
  const { head } = makeHeadGeometries(R, OFFSET)
  head.computeBoundingBox()
  const centre = head.boundingBox.getCenter(new THREE.Vector3())
  for (const [rx, ry] of [[0.5, 0], [-0.5, 0], [0, 0.18], [0.6, 0.6]]) {
    const pivot = new THREE.Group()
    pivot.rotation.set(rx, ry, 0)
    pivot.updateMatrixWorld()
    const moved = centre.clone().applyMatrix4(pivot.matrixWorld)
    assert.ok(moved.distanceTo(new THREE.Vector3(0, 0, 0)) <= OFFSET + 1e-9, `đầu cách cổ ${moved.length().toFixed(3)} (tối đa ${OFFSET})`)
  }
  // so với cách cũ: xoay mesh quanh gốc, đầu nằm cao 1,66 so với gốc → pitch 0,5 rad làm đầu dịch ~0,8
  const old = new THREE.Vector3(0, 1.66, 0).applyEuler(new THREE.Euler(-0.5, 0, 0))
  assert.ok(old.distanceTo(new THREE.Vector3(0, 1.66, 0)) > 0.7, 'cách cũ: đầu văng > 0,7')
})
