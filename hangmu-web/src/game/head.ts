// Hình học đầu + tóc, tách riêng (chỉ phụ thuộc three, không cần DOM) để kiểm thử hướng mặt và tâm xoay.
import * as THREE from 'three'

/**
 * Đầu hình cầu đã quay để mặt (giữa ảnh, u = 0,5) hướng về +z — phía trước của thân — và tịnh tiến so với cổ.
 * Hình cầu của three.js đặt giữa ảnh ở hướng +x; không quay thì mặt nhìn ngang 90° so với thân.
 */
export function makeHeadGeometries(headR: number, headCentreAboveNeck: number): { head: THREE.BufferGeometry; hair: THREE.BufferGeometry } {
  const head = new THREE.SphereGeometry(headR, 18, 12)
  head.rotateY(-Math.PI / 2)
  head.translate(0, headCentreAboveNeck, 0)
  const hair = new THREE.SphereGeometry(headR * 1.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)
  hair.translate(0, headCentreAboveNeck + 0.02, 0)
  return { head, hair }
}

/**
 * Tóc theo kiểu (0 ngắn, 1 đầu đinh, 2 dài, 3 mào). Cùng tâm và hướng với `makeHeadGeometries` (mặt về +z, gáy về −z).
 * Gộp thành một geometry để mỗi nhân vật vẫn chỉ có một mesh tóc.
 */
export function makeHairGeometry(style: number, headR: number, headCentreAboveNeck: number, merge: (parts: THREE.BufferGeometry[]) => THREE.BufferGeometry | null): THREE.BufferGeometry {
  const y = headCentreAboveNeck + 0.02
  const cap = (scale: number, theta: number) => {
    const g = new THREE.SphereGeometry(headR * scale, 16, 8, 0, Math.PI * 2, 0, Math.PI * theta)
    g.translate(0, y, 0)
    return g
  }
  if (style === 1) return cap(1.03, 0.34) // đầu đinh: lớp tóc mỏng sát da đầu
  if (style === 2) {
    // dài: mũ tóc + mảng tóc phủ gáy xuống tới cổ (nửa cầu phía sau: phi từ π tới 2π ứng với z < 0)
    const back = new THREE.SphereGeometry(headR * 1.09, 16, 10, Math.PI, Math.PI, 0, Math.PI * 0.72)
    back.translate(0, y - 0.01, 0)
    const merged = merge([toNonIndexed(cap(1.06, 0.42)), toNonIndexed(back)])
    return merged ?? cap(1.06, 0.42)
  }
  if (style === 3) {
    // mào: mũ tóc thấp + dải tóc dựng giữa đỉnh đầu từ trán ra gáy
    const ridge = new THREE.BoxGeometry(0.09, 0.13, headR * 1.7)
    ridge.translate(0, y + headR * 0.98, -0.02)
    const merged = merge([toNonIndexed(cap(1.04, 0.36)), toNonIndexed(ridge)])
    return merged ?? cap(1.04, 0.36)
  }
  return cap(1.06, 0.42) // ngắn (như cũ)
}

function toNonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  if (out !== g) g.dispose()
  out.deleteAttribute('uv') // các phần có/không uv khác nhau: bỏ uv để gộp được (tóc chỉ dùng màu trơn)
  return out
}
