// Vòng 5 hình nộm rơm quanh đống lửa + cảnh ném đồ. Mọi hình khối và họa tiết đều tự vẽ bằng mã.
import * as THREE from 'three'
import { RING_RADIUS, SLOTS, arc, rageCamera, slotAngle, slotXZ, splatOpacity, springStep } from './rageMath.ts'
import type { Vec3 } from './rageMath.ts'
import { PODIUM_HEIGHT, PODIUM_RADIUS } from './layout.ts'

/** Hình nộm đứng trên bục giữa sân; camera ném đồ ở ngoài bục. */
const floorHeight = (x: number, z: number): number => (Math.hypot(x, z) < PODIUM_RADIUS ? PODIUM_HEIGHT : 0)

const FLIGHT_S = 0.52
const MAX_SPLATS = 40
const ITEM_COUNT = 4

interface Effigy {
  root: THREE.Group
  sway: THREE.Group
  placard: THREE.Mesh
  placardMaterial: THREE.MeshBasicMaterial
  hitMeshes: THREE.Mesh[]
  angleX: number
  angleZ: number
  velX: number
  velZ: number
}

interface Flying {
  mesh: THREE.Mesh
  from: Vec3
  to: Vec3
  born: number
  slot: number
  item: number
  hit: THREE.Vector3 | null
  spin: number
}

interface Splat {
  sprite: THREE.Sprite
  born: number
  parent: THREE.Object3D
}

export interface ThrowRequest {
  slot: number
  item: number
  u: number
  v: number
  camera: THREE.Camera
  now: number
}

export interface RageRing {
  group: THREE.Group
  /** Cập nhật tên trên bảng của từng ô (mỗi ô một chuỗi). */
  setLabels(names: readonly string[]): void
  cameraFor(slot: number): { position: Vec3; look: Vec3 }
  throwItem(request: ThrowRequest): void
  update(now: number, dtSec: number): void
  readonly flying: number
  readonly splats: number
  dispose(): void
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (g) draw(g)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function burlapTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#17171d'
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = '#26262f'
    g.lineWidth = 1
    for (let i = 0; i < 128; i += 4) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + (i % 8), 128)
      g.stroke()
      g.beginPath()
      g.moveTo(0, i)
      g.lineTo(128, i + (i % 8))
      g.stroke()
    }
    g.fillStyle = '#e2102c'
    g.fillRect(0, 60, 128, 8) // dải đỏ ngang ngực
  })
}

function faceTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e8c3a0'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#1b1008'
    for (const x of [92, 164]) {
      g.beginPath()
      g.arc(x, 112, 14, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#e85a4a88'
    for (const x of [64, 192]) {
      g.beginPath()
      g.arc(x, 150, 16, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = '#1b1008'
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(80, 176)
    for (let i = 0; i < 6; i += 1) g.lineTo(80 + (i + 1) * 16, 176 + (i % 2 === 0 ? 14 : -4))
    g.stroke()
  })
}

function placardTexture(text: string): THREE.CanvasTexture {
  return canvasTexture(512, 160, (g) => {
    g.fillStyle = '#12121a'
    g.fillRect(0, 0, 512, 160)
    g.strokeStyle = '#ff1f3d'
    g.lineWidth = 8
    g.strokeRect(8, 8, 496, 144)
    g.fillStyle = '#ffffff'
    g.font = '800 64px "Be Vietnam Pro", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 256, 84, 460)
  })
}

const SPLAT_COLORS = ['#d1301f', '#6f8f3a', '#f6e7d0', '#e8e4da']

function splatTexture(kind: number): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = SPLAT_COLORS[kind % SPLAT_COLORS.length]!
    g.beginPath()
    g.arc(64, 64, 26 + (kind % 2) * 4, 0, Math.PI * 2)
    g.fill()
    const spikes = 11
    for (let i = 0; i < spikes; i += 1) {
      const a = (i / spikes) * Math.PI * 2 + kind
      const len = 30 + ((i * 17 + kind * 7) % 24)
      g.beginPath()
      g.ellipse(64 + Math.cos(a) * len * 0.6, 64 + Math.sin(a) * len * 0.6, len * 0.35, 6 + (i % 3) * 2, a, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#00000022'
    g.beginPath()
    g.arc(70, 70, 20, 0, Math.PI * 2)
    g.fill()
  })
}

export function createRageRing(scene: THREE.Scene): RageRing {
  const group = new THREE.Group()
  scene.add(group)
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const texs: THREE.Texture[] = []
  const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(item: T): T => {
    if (item instanceof THREE.BufferGeometry) geos.push(item)
    else if (item instanceof THREE.Material) mats.push(item)
    else texs.push(item)
    return item
  }

  const burlap = own(burlapTexture())
  const sack = own(new THREE.MeshStandardMaterial({ map: burlap, roughness: 1 }))
  const face = own(new THREE.MeshStandardMaterial({ map: own(faceTexture()), roughness: 1 }))
  const wood = own(new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.5 }))
  const rope = own(new THREE.MeshStandardMaterial({ color: '#e2102c', roughness: 0.6 }))
  const hatMat = own(new THREE.MeshStandardMaterial({ color: '#e2102c', roughness: 0.5 }))
  const postGeo = own(new THREE.CylinderGeometry(0.07, 0.09, 2.7, 8))
  const barGeo = own(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8))
  const bodyGeo = own(new THREE.CapsuleGeometry(0.34, 0.75, 4, 12))
  const headGeo = own(new THREE.SphereGeometry(0.28, 16, 12))
  const hatGeo = own(new THREE.TorusGeometry(0.31, 0.035, 8, 20, Math.PI)) // quai tai nghe ôm qua đỉnh đầu
  const earGeo = own(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12))
  const armGeo = own(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8))
  const beltGeo = own(new THREE.TorusGeometry(0.34, 0.035, 8, 20))
  const plateGeo = own(new THREE.PlaneGeometry(1.5, 0.47))

  const effigies: Effigy[] = []
  for (let i = 0; i < SLOTS; i += 1) {
    const { x, z } = slotXZ(i)
    const root = new THREE.Group()
    root.position.set(x, floorHeight(x, z), z)
    root.rotation.y = slotAngle(i) // mặt hướng ra ngoài vòng, về phía người ném
    const sway = new THREE.Group()
    const post = new THREE.Mesh(postGeo, wood)
    post.position.y = 1.35
    const bar = new THREE.Mesh(barGeo, wood)
    bar.rotation.z = Math.PI / 2
    bar.position.y = 1.7
    const body = new THREE.Mesh(bodyGeo, sack)
    body.position.y = 1.35
    const belt = new THREE.Mesh(beltGeo, rope)
    belt.rotation.x = Math.PI / 2
    belt.position.y = 1.05
    const head = new THREE.Mesh(headGeo, face)
    head.position.y = 2.05
    head.rotation.y = 0
    const hat = new THREE.Mesh(hatGeo, hatMat)
    hat.position.y = 2.05
    const earL = new THREE.Mesh(earGeo, hatMat)
    earL.rotation.z = Math.PI / 2
    earL.position.set(-0.3, 2.05, 0)
    const earR = earL.clone()
    earR.position.x = 0.3
    const armL = new THREE.Mesh(armGeo, sack)
    armL.position.set(-0.62, 1.45, 0)
    armL.rotation.z = 0.25
    const armR = new THREE.Mesh(armGeo, sack)
    armR.position.set(0.62, 1.45, 0)
    armR.rotation.z = -0.25
    sway.add(post, bar, body, belt, head, hat, earL, earR, armL, armR)
    const placardMaterial = own(new THREE.MeshBasicMaterial({ map: own(placardTexture('')) }))
    const placard = new THREE.Mesh(plateGeo, placardMaterial)
    placard.position.set(0, 0.55, 0.45)
    placard.rotation.x = -0.12
    root.add(sway, placard)
    group.add(root)
    effigies.push({ root, sway, placard, placardMaterial, hitMeshes: [body, head], angleX: 0, angleZ: 0, velX: 0, velZ: 0 })
  }

  // ---- đồ ném ----
  const itemGeos = [
    own(new THREE.SphereGeometry(0.1, 12, 10)), // cà chua
    own(new THREE.SphereGeometry(0.1, 10, 8).scale(2.2, 0.35, 1)), // dép
    own(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 14)), // bánh
    own(new THREE.IcosahedronGeometry(0.1, 0)), // giấy vo
  ]
  const itemMats = ['#d1301f', '#6f8f3a', '#f6e7d0', '#efece4'].map((c) => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })))
  const splatMaps = Array.from({ length: ITEM_COUNT }, (_, k) => own(splatTexture(k)))

  const flying: Flying[] = []
  const splats: Splat[] = []
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hitTargets = effigies.flatMap((e) => e.hitMeshes)

  const addSplat = (effigy: Effigy, worldPoint: THREE.Vector3, item: number, towards: THREE.Vector3, now: number) => {
    const material = new THREE.SpriteMaterial({ map: splatMaps[item % ITEM_COUNT]!, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    const local = effigy.sway.worldToLocal(worldPoint.clone().addScaledVector(towards, 0.06))
    sprite.position.copy(local)
    const size = 0.38 + Math.random() * 0.2
    sprite.scale.set(size, size, 1)
    material.rotation = Math.random() * Math.PI * 2
    effigy.sway.add(sprite)
    splats.push({ sprite, born: now, parent: effigy.sway })
    while (splats.length > MAX_SPLATS) {
      const old = splats.shift()!
      old.parent.remove(old.sprite)
      old.sprite.material.dispose()
    }
  }

  return {
    group,
    get flying() {
      return flying.length
    },
    get splats() {
      return splats.length
    },
    setLabels(names) {
      effigies.forEach((e, i) => {
        const old = e.placardMaterial.map
        e.placardMaterial.map = placardTexture(names[i] ?? '')
        e.placardMaterial.needsUpdate = true
        old?.dispose()
      })
    },
    cameraFor(slot) {
      return rageCamera(((slot % SLOTS) + SLOTS) % SLOTS, floorHeight)
    },
    throwItem({ slot, item, u, v, camera, now }) {
      const effigy = effigies[((slot % SLOTS) + SLOTS) % SLOTS]
      if (!effigy) return
      const kind = ((item % ITEM_COUNT) + ITEM_COUNT) % ITEM_COUNT
      camera.updateMatrixWorld()
      ndc.set(Math.max(-1, Math.min(1, u)), Math.max(-1, Math.min(1, v)))
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(hitTargets, false)
      const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const forward = raycaster.ray.direction
      const from = origin.clone().addScaledVector(right, 0.35).addScaledVector(forward, 0.7).add(new THREE.Vector3(0, -0.4, 0))
      const first = hits[0]
      const target = first ? first.point.clone() : raycaster.ray.at(14, new THREE.Vector3())
      const mesh = new THREE.Mesh(itemGeos[kind]!, itemMats[kind]!)
      mesh.position.copy(from)
      scene.add(mesh)
      flying.push({
        mesh, from: { x: from.x, y: from.y, z: from.z }, to: { x: target.x, y: target.y, z: target.z },
        born: now, slot: effigies.indexOf(effigy), item: kind, hit: first ? first.point.clone() : null, spin: 6 + Math.random() * 8,
      })
    },
    update(now, dtSec) {
      for (let i = flying.length - 1; i >= 0; i -= 1) {
        const f = flying[i]!
        const k = (now - f.born) / 1000 / FLIGHT_S
        if (k >= 1) {
          scene.remove(f.mesh)
          flying.splice(i, 1)
          const effigy = effigies[f.slot]
          if (effigy && f.hit) {
            const toCamera = new THREE.Vector3(Math.sin(slotAngle(f.slot)), 0, Math.cos(slotAngle(f.slot)))
            addSplat(effigy, f.hit, f.item, toCamera, now)
            const push = f.item === 2 ? 1.6 : 1.1 // bánh nặng hơn
            effigy.velX += (Math.random() - 0.5) * 1.2 * push
            effigy.velZ += -push * 2.2 // bị đẩy lùi ra sau (xa người ném)
          }
          continue
        }
        const p = arc(k, f.from, f.to, 0.7)
        f.mesh.position.set(p.x, p.y, p.z)
        f.mesh.rotation.x += f.spin * dtSec
        f.mesh.rotation.z += f.spin * 0.6 * dtSec
      }
      for (const e of effigies) {
        const sx = springStep(e.angleX, e.velX, dtSec)
        e.angleX = sx.angle
        e.velX = sx.velocity
        const sz = springStep(e.angleZ, e.velZ, dtSec)
        e.angleZ = sz.angle
        e.velZ = sz.velocity
        e.sway.rotation.x = e.angleX
        e.sway.rotation.z = e.angleZ
      }
      for (let i = splats.length - 1; i >= 0; i -= 1) {
        const s = splats[i]!
        const opacity = splatOpacity((now - s.born) / 1000)
        if (opacity <= 0) {
          s.parent.remove(s.sprite)
          s.sprite.material.dispose()
          splats.splice(i, 1)
        } else s.sprite.material.opacity = opacity
      }
    },
    dispose() {
      for (const f of flying) scene.remove(f.mesh)
      flying.length = 0
      for (const s of splats) {
        s.parent.remove(s.sprite)
        s.sprite.material.dispose()
      }
      splats.length = 0
      for (const e of effigies) e.placardMaterial.map?.dispose()
      scene.remove(group)
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      for (const t of texs) t.dispose()
    },
  }
}

export { RING_RADIUS }
