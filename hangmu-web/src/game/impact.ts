// Hiệu ứng "chạm" nhìn thấy trong cảnh 3D: tia sáng khi đấm trúng, vệt gió khi đấm hụt.
// Camera đứng sau lưng người chơi nên cánh tay duỗi thẳng về phía trước bị che; hiệu ứng này giúp thấy rõ đòn đánh.
// Bản gốc không có trong capture — [Inference] tự thiết kế; ảnh vẽ bằng canvas, không dùng tài nguyên ngoài.
import * as THREE from 'three'

export type ImpactKind = 'hit' | 'miss'

export const IMPACT_DURATION: Record<ImpactKind, number> = { hit: 0.45, miss: 0.4 }

/** Kích thước và độ mờ của hiệu ứng sau `age` giây (0 ngoài khoảng sống). Thuần tuý để kiểm thử. */
export function impactFrame(kind: ImpactKind, age: number): { scale: number; opacity: number } {
  const life = IMPACT_DURATION[kind]
  if (!(age >= 0) || age >= life) return { scale: 0, opacity: 0 }
  const k = age / life
  const out = 1 - (1 - k) * (1 - k) // nở nhanh rồi chậm lại
  if (kind === 'hit') return { scale: 0.7 + 1.5 * out, opacity: k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75 }
  return { scale: 0.8 + 0.9 * out, opacity: 0.85 * (1 - k) }
}

function makeTexture(kind: ImpactKind): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const c = size / 2
  if (kind === 'hit') {
    g.beginPath()
    const spikes = 9
    for (let i = 0; i < spikes * 2; i += 1) {
      const r = i % 2 === 0 ? c * 0.95 : c * 0.45
      const a = (i / (spikes * 2)) * Math.PI * 2
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
    }
    g.closePath()
    g.fillStyle = '#ffd23c'
    g.strokeStyle = '#d4231f'
    g.lineWidth = 7
    g.lineJoin = 'round'
    g.fill()
    g.stroke()
    g.beginPath()
    g.arc(c, c, c * 0.28, 0, Math.PI * 2)
    g.fillStyle = '#fff6c8'
    g.fill()
  } else {
    g.strokeStyle = '#ffffff'
    g.lineCap = 'round'
    for (let i = 0; i < 3; i += 1) {
      g.lineWidth = 7 - i * 2
      g.beginPath()
      g.arc(c + 6, c, c * (0.78 - i * 0.2), -Math.PI * 0.55, Math.PI * 0.55)
      g.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface Fx {
  sprite: THREE.Sprite
  kind: ImpactKind
  bornAt: number
}

export interface ImpactFx {
  /** `delaySec`: chờ rồi mới hiện (đòn hụt hiện lúc tay duỗi hết). */
  spawn(kind: ImpactKind, x: number, y: number, z: number, nowMs: number, delaySec?: number): void
  update(nowMs: number): void
  dispose(): void
}

const MAX_ACTIVE = 12

export function createImpactFx(scene: THREE.Scene): ImpactFx {
  const textures: Record<ImpactKind, THREE.CanvasTexture> = { hit: makeTexture('hit'), miss: makeTexture('miss') }
  const all: THREE.Sprite[] = [] // mỗi sprite có vật liệu riêng (độ mờ riêng)
  const free: Record<ImpactKind, THREE.Sprite[]> = { hit: [], miss: [] }
  const active: Fx[] = []
  const take = (kind: ImpactKind): THREE.Sprite => {
    const reused = free[kind].pop()
    if (reused) return reused
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[kind], transparent: true, depthTest: false, depthWrite: false }))
    sprite.renderOrder = 20 // vẽ sau cùng, không bị người đứng trước che
    sprite.visible = false
    scene.add(sprite)
    all.push(sprite)
    return sprite
  }
  const release = (fx: Fx) => {
    fx.sprite.visible = false
    free[fx.kind].push(fx.sprite)
  }
  return {
    spawn(kind, x, y, z, nowMs, delaySec = 0) {
      if (active.length >= MAX_ACTIVE) release(active.shift()!)
      const sprite = take(kind)
      sprite.position.set(x, y, z)
      sprite.visible = false
      active.push({ sprite, kind, bornAt: nowMs + delaySec * 1000 })
    },
    update(nowMs) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const fx = active[i]!
        const age = (nowMs - fx.bornAt) / 1000
        if (age >= IMPACT_DURATION[fx.kind]) {
          release(fx)
          active.splice(i, 1)
          continue
        }
        if (age < 0) continue
        const f = impactFrame(fx.kind, age)
        fx.sprite.visible = true
        fx.sprite.scale.set(f.scale, f.scale, 1)
        fx.sprite.material.opacity = f.opacity
        fx.sprite.material.rotation = fx.kind === 'hit' ? age * 2 : 0
      }
    },
    dispose() {
      for (const sprite of all) {
        scene.remove(sprite)
        sprite.material.dispose()
      }
      all.length = 0
      active.length = 0
      free.hit.length = 0
      free.miss.length = 0
      for (const t of Object.values(textures)) t.dispose()
    },
  }
}
