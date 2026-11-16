// Bóng mờ dưới chân nhân vật: trên sàn sáng, nhân vật không có bóng trông như lơ lửng. Một InstancedMesh duy nhất cho mọi người
// (thêm đúng 1 lượt vẽ dù có hàng trăm người) thay cho bóng đổ thật của đèn.
import * as THREE from 'three'

export interface ShadowBlobs {
  /** Gọi đầu mỗi khung hình trước khi `add`. */
  begin(): void
  /** Đặt một bóng tại vị trí chân; `scale` ≈ 1 cho người thường. Vượt số tối đa thì bỏ qua. */
  add(x: number, y: number, z: number, scale?: number): void
  /** Chốt số bóng đã đặt trong khung hình. */
  end(): void
  dispose(): void
}

export function createShadowBlobs(scene: THREE.Scene, max = 640): ShadowBlobs {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
    grad.addColorStop(0, 'rgba(20,24,36,0.55)')
    grad.addColorStop(0.6, 'rgba(20,24,36,0.28)')
    grad.addColorStop(1, 'rgba(20,24,36,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const mesh = new THREE.InstancedMesh(geometry, material, max)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  mesh.count = 0
  scene.add(mesh)
  const matrix = new THREE.Matrix4()
  let n = 0
  return {
    begin() {
      n = 0
    },
    add(x, y, z, scale = 1) {
      if (n >= max) return
      const s = 1.15 * scale
      matrix.makeScale(s, 1, s)
      matrix.setPosition(x, y + 0.04, z)
      mesh.setMatrixAt(n, matrix)
      n += 1
    },
    end() {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    },
    dispose() {
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      texture.dispose()
      mesh.dispose()
    },
  }
}
