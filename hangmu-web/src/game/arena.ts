// Sàn đấu 3D cho giao lưu võ thuật. Tất cả hình khối và họa tiết đều tự vẽ bằng mã (không dùng tài nguyên bên ngoài).
// Cảnh riêng (không lẫn với hang): Hang.tsx vẽ cảnh này thay cho cảnh hang khi đang có trận.
import * as THREE from 'three'
import type { DuelPhase, DuelView } from './duel.ts'
import { fightPose } from './fightPose.ts'
import type { FightPose, PoseAngles } from './fightPose.ts'
import { smoothTowards } from './gait.ts'
import { makeFootballer, releaseFootballer, setFootballerLod } from './person.ts'
import type { Footballer } from './person.ts'

const FIGHTER_X = 2.3
const RING_HALF = 5
const CROWD = 72

interface Fighter {
  slot: THREE.Group
  figure: Footballer
  facing: 1 | -1
  baseX: number
  pose: FightPose
  poseAt: number
  /** Tư thế đang hiển thị (đã làm mượt) để chuyển tư thế không bị nhảy. */
  shown: PoseAngles | null
}

interface Fx {
  sprite: THREE.Sprite
  born: number
  life: number
  rise: number
  grow: number
  fromScale: number
  /** Chiều cao / chiều rộng của tấm hiệu ứng. */
  aspect: number
}

export interface ArenaFighterInfo {
  name: string
  number: number | null
  /** Mã ngoại hình (shared/look.mjs); thiếu → mặc định. */
  look?: number
}

export interface Arena {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Gọi khi bắt đầu một trận (tạo hai võ sĩ). */
  setFighters(me: ArenaFighterInfo, opp: ArenaFighterInfo): void
  update(view: DuelView, now: number, dtSec: number, aspect: number): void
  /** Số võ sĩ đang có trên sàn (để kiểm thử). */
  readonly fighterCount: number
  dispose(): void
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (g) draw(g)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function floorTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#16161e'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 16; i += 1) {
      g.fillStyle = i % 2 ? '#1d1d27' : '#14141b'
      g.fillRect(0, i * 32, 512, 32)
    }
    g.strokeStyle = '#ff1f3d'
    g.lineWidth = 8
    g.strokeRect(24, 24, 464, 464)
    g.lineWidth = 5
    g.beginPath()
    g.arc(256, 256, 120, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#b3101f'
    g.beginPath()
    g.arc(256, 256, 22, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#efe9dd55'
    g.font = '800 54px "Be Vietnam Pro", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('TÊ ĐỎ', 256, 100)
    g.fillText('TÊ ĐỎ', 256, 412)
  })
}

function starTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 60)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.35, '#ffd27a')
    grad.addColorStop(1, '#ff5a1f00')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#fff6d0'
    g.beginPath()
    for (let i = 0; i < 16; i += 1) {
      const r = i % 2 === 0 ? 58 : 20
      const a = (i / 16) * Math.PI * 2
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r)
    }
    g.closePath()
    g.fill()
  })
}

function sparkTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.strokeStyle = '#bfe9ff'
    g.lineWidth = 8
    g.beginPath()
    g.arc(64, 64, 40, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 5
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46)
      g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60)
      g.stroke()
    }
  })
}

function damageTexture(text: string): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
    g.font = '900 88px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 12
    g.strokeStyle = '#2a0508'
    g.strokeText(text, 128, 66)
    g.fillStyle = '#ff4b4b'
    g.fillText(text, 128, 66)
  })
}

export function createArena(): Arena {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#09080d')
  scene.fog = new THREE.Fog('#09080d', 15, 38)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80)

  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const texs: THREE.Texture[] = []
  const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(item: T): T => {
    if (item instanceof THREE.BufferGeometry) geos.push(item)
    else if (item instanceof THREE.Material) mats.push(item)
    else texs.push(item)
    return item
  }

  // ---- ánh sáng ----
  scene.add(new THREE.HemisphereLight('#e6e0f0', '#2a1620', 1.3))
  const key = new THREE.DirectionalLight('#fff0d0', 2.1)
  key.position.set(-3, 9, 6)
  scene.add(key)
  const rim = new THREE.PointLight('#ff1f3d', 16, 22, 2)
  rim.position.set(0, 3.5, -5)
  scene.add(rim)

  // ---- sàn + dây + cột ----
  const floorMap = own(floorTexture())
  const floor = new THREE.Mesh(own(new THREE.BoxGeometry(RING_HALF * 2, 0.4, RING_HALF * 2)), own(new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.85 })))
  floor.position.y = -0.2
  scene.add(floor)
  const apron = new THREE.Mesh(own(new THREE.BoxGeometry(RING_HALF * 2 + 1, 0.7, RING_HALF * 2 + 1)), own(new THREE.MeshStandardMaterial({ color: '#241510', roughness: 0.9 })))
  apron.position.y = -0.75
  scene.add(apron)
  const postMat = own(new THREE.MeshStandardMaterial({ color: '#b3101f', roughness: 0.5 }))
  const ropeA = own(new THREE.MeshStandardMaterial({ color: '#e8e1d2', roughness: 0.6 }))
  const ropeB = own(new THREE.MeshStandardMaterial({ color: '#b3101f', roughness: 0.6 }))
  const postGeo = own(new THREE.CylinderGeometry(0.13, 0.13, 2, 12))
  const ropeGeo = own(new THREE.CylinderGeometry(0.045, 0.045, RING_HALF * 2, 8))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(x * RING_HALF, 1, z * RING_HALF)
    scene.add(post)
  }
  for (let i = 0; i < 3; i += 1) {
    const y = 0.7 + i * 0.5
    const mat = i === 1 ? ropeA : ropeB
    // Dây phía gần camera (z > 0) bỏ đi để không cắt ngang thân hai võ sĩ.
    const back = new THREE.Mesh(ropeGeo, mat)
    back.rotation.z = Math.PI / 2
    back.position.set(0, y, -RING_HALF)
    scene.add(back)
    for (const sign of [-1, 1]) {
      const side = new THREE.Mesh(ropeGeo, mat)
      side.rotation.x = Math.PI / 2
      side.position.set(sign * RING_HALF, y, 0)
      scene.add(side)
    }
  }

  // ---- đèn rọi (chùm sáng giả) ----
  const beam = new THREE.Mesh(
    own(new THREE.ConeGeometry(4.2, 10, 28, 1, true)),
    own(new THREE.MeshBasicMaterial({ color: '#ffe9b8', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
  )
  beam.position.set(0, 5, 0)
  scene.add(beam)

  // ---- khán giả: một InstancedMesh duy nhất (1 draw call) ----
  const crowdGeo = own(new THREE.CapsuleGeometry(0.3, 0.9, 2, 6))
  const crowdMat = own(new THREE.MeshStandardMaterial({ roughness: 0.9 }))
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, CROWD)
  const crowdBase: Array<[number, number, number, number]> = []
  const tmp = new THREE.Object3D()
  const palette = ['#b3101f', '#efe9dd', '#3a2f2a', '#8a0a20', '#c9a24e'].map((c) => new THREE.Color(c))
  // Khán giả chỉ ở hai bên và phía sau võ đài (bỏ cung phía camera để không che tầm nhìn khi màn hình hẹp).
  const FRONT_GAP = 1.15 // rad, tính từ hướng về camera
  for (let i = 0; i < CROWD; i += 1) {
    const tier = i % 2
    const angle = FRONT_GAP + (i / CROWD) * (Math.PI * 2 - FRONT_GAP * 2) + tier * 0.05
    const radius = 9 + tier * 2.2
    crowdBase.push([Math.sin(angle) * radius, 0.5 + tier * 0.7, Math.cos(angle) * radius, Math.random() * 6])
    crowd.setColorAt(i, palette[i % palette.length]!)
  }
  scene.add(crowd)

  // ---- hiệu ứng ----
  const starMap = own(starTexture())
  const sparkMap = own(sparkTexture())
  const damageMaps = new Map<string, THREE.CanvasTexture>()
  const fxList: Fx[] = []
  const spawnFx = (map: THREE.Texture, x: number, y: number, z: number, now: number, life: number, scale: number, grow: number, rise = 0) => {
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(x, y, z)
    const aspect = map === starMap || map === sparkMap ? 1 : 0.5 // số sát thương là tấm ngang 2:1
    sprite.scale.set(scale, scale * aspect, 1)
    scene.add(sprite)
    fxList.push({ sprite, born: now, life, rise, grow, fromScale: scale, aspect })
  }
  const damageMap = (text: string) => {
    let map = damageMaps.get(text)
    if (!map) {
      map = damageTexture(text)
      damageMaps.set(text, map)
    }
    return map
  }

  // ---- võ sĩ ----
  const fighters: Fighter[] = []
  const clearFighters = () => {
    for (const f of fighters) {
      scene.remove(f.slot)
      releaseFootballer(f.figure)
    }
    fighters.length = 0
  }
  const makeFighter = (info: ArenaFighterInfo, facing: 1 | -1): Fighter => {
    const figure = makeFootballer(info.name || 'Võ sĩ', info.number, info.look)
    setFootballerLod(figure, 'full')
    figure.group.rotation.y = (facing * Math.PI) / 2
    figure.group.scale.setScalar(1.25)
    figure.detail.children.forEach((child) => {
      if (child instanceof THREE.Sprite) child.scale.set(1.25, 0.24, 1) // nhãn tên nhỏ lại cho đỡ che võ đài
    })
    const slot = new THREE.Group()
    slot.add(figure.group)
    const baseX = -facing * FIGHTER_X
    slot.position.set(baseX, 0, 0)
    scene.add(slot)
    return { slot, figure, facing, baseX, pose: 'idle', poseAt: 0, shown: null }
  }

  let shake = 0
  let prevHpMe = -1
  let prevHpPeer = -1
  let prevMe: FightPose = 'idle'
  let prevOpp: FightPose = 'idle'
  let lastPhase: DuelPhase = 'idle'

  const poseOf = (value: string): FightPose =>
    value === 'windup' || value === 'strike' || value === 'guard' || value === 'hurt' || value === 'hit' || value === 'block' || value === 'ko' ? value : 'idle'

  const apply = (f: Fighter, pose: FightPose, now: number, phase: number, dtSec: number) => {
    if (f.pose !== pose) {
      f.pose = pose
      f.poseAt = now
    }
    // Các đường cong tư thế liên tục theo thời gian nhưng đổi tư thế thì nhảy tức thì; làm mượt để chuyển cảnh trơn tru.
    // Ra đòn / trúng đòn cần nhanh (đòn phải "chạm"), còn lại chậm hơn cho mềm.
    const target = fightPose(pose, now - f.poseAt, phase)
    const tau = pose === 'strike' || pose === 'hit' ? 0.04 : pose === 'ko' ? 0.07 : 0.085
    const a = f.shown ? smoothTowards(f.shown, target, dtSec, tau) : target
    f.shown = a
    const fig = f.figure
    fig.arms[0].rotation.x = a.rArm
    fig.arms[1].rotation.x = a.lArm
    fig.elbows[0].rotation.x = a.rElbow
    fig.elbows[1].rotation.x = a.lElbow
    fig.legs[0].rotation.x = a.rLeg
    fig.legs[1].rotation.x = a.lLeg
    fig.knees[0].rotation.x = a.rKnee
    fig.knees[1].rotation.x = a.lKnee
    fig.torso.rotation.x = a.torsoLean
    fig.head.rotation.x = a.headPitch
    fig.detail.rotation.y = a.torsoTwist
    fig.detail.position.y = -a.crouch
    f.slot.position.x = f.baseX + f.facing * a.bodyShift
    // ngã ra sau (xa đối thủ), xoay quanh bàn chân
    f.slot.rotation.z = f.facing * (Math.PI / 2) * a.fall
    f.slot.position.y = 0.18 * a.fall
  }

  return {
    scene,
    camera,
    get fighterCount() {
      return fighters.length
    },
    setFighters(me, opp) {
      clearFighters()
      fighters.push(makeFighter(me, 1), makeFighter(opp, -1))
      prevHpMe = -1
      prevHpPeer = -1
    },
    update(view, now, dtSec, aspect) {
      const [mine, theirs] = fighters
      if (!mine || !theirs) return
      const phase = now / 520
      if (view.phase !== lastPhase) {
        lastPhase = view.phase
        shake = 0
      }
      const myPose = view.phase === 'ended' && view.end?.won === false && view.end.result === 'ko' ? 'ko' : poseOf(view.me)
      const oppPose = poseOf(view.opp)
      apply(mine, myPose, now, phase, dtSec)
      apply(theirs, oppPose, now, phase + 1.3, dtSec)

      // đòn trúng: máu giảm -> sao + số sát thương + rung camera
      if (prevHpMe >= 0 && view.hpMe < prevHpMe) {
        spawnFx(starMap, mine.baseX, 1.9, 0.4, now, 380, 1.1, 1.6)
        spawnFx(damageMap(`-${prevHpMe - view.hpMe}`), mine.baseX, 2.6, 0.3, now, 900, 1.5, 0.1, 1.2)
        shake = 0.32
      }
      if (prevHpPeer >= 0 && view.hpPeer < prevHpPeer) {
        spawnFx(starMap, theirs.baseX, 1.9, 0.4, now, 380, 1.1, 1.6)
        spawnFx(damageMap(`-${prevHpPeer - view.hpPeer}`), theirs.baseX, 2.6, 0.3, now, 900, 1.5, 0.1, 1.2)
        shake = 0.22
      }
      // đỡ thành công: tia lửa ở chỗ tay
      if (myPose === 'block' && prevMe !== 'block') spawnFx(sparkMap, mine.baseX + 0.7, 1.9, 0.6, now, 320, 0.9, 1.4)
      if (oppPose === 'guard' && prevOpp !== 'guard') spawnFx(sparkMap, theirs.baseX - 0.7, 1.9, 0.6, now, 320, 0.9, 1.4)
      prevHpMe = view.hpMe
      prevHpPeer = view.hpPeer
      prevMe = myPose
      prevOpp = oppPose

      for (let i = fxList.length - 1; i >= 0; i -= 1) {
        const fx = fxList[i]!
        const k = (now - fx.born) / fx.life
        if (k >= 1) {
          scene.remove(fx.sprite)
          fx.sprite.material.dispose()
          fxList.splice(i, 1)
          continue
        }
        const s = fx.fromScale * (1 + fx.grow * k)
        fx.sprite.scale.set(s, s * fx.aspect, 1)
        fx.sprite.position.y += fx.rise * dtSec
        fx.sprite.material.opacity = 1 - k * k
      }

      // khán giả nhún nhảy, phấn khích hơn khi đang đánh
      const excite = view.phase === 'fight' ? 1 : 0.35
      for (let i = 0; i < CROWD; i += 1) {
        const [x, y, z, seed] = crowdBase[i]!
        tmp.position.set(x, y + Math.abs(Math.sin(now / 260 + seed)) * 0.25 * excite, z)
        tmp.lookAt(0, y, 0)
        tmp.updateMatrix()
        crowd.setMatrixAt(i, tmp.matrix)
      }
      crowd.instanceMatrix.needsUpdate = true

      // camera: nhìn ngang võ đài; màn hình hẹp (điện thoại dọc) thì lùi ra để thấy đủ hai người
      // Cần thấy bề ngang ~7 đơn vị (hai võ sĩ + khoảng thở). Màn hình rộng thì giữ khoảng cách mặc định; màn hình dọc thì lùi vừa đủ.
      const halfTan = Math.tan((camera.fov * Math.PI) / 360)
      const base = Math.max(9.4, 7 / (2 * halfTan * Math.max(0.3, aspect)))
      let distance = base
      let height = 2.6 + (base - 9.4) * 0.25
      let orbit = 0
      if (view.phase === 'countdown') {
        const k = Math.min(1, Math.max(0, 1 - (view.goAt - now) / 5000))
        distance *= 1.25 - 0.25 * k // tiến lại gần dần khi sắp bắt đầu
      } else if (view.phase === 'ended') {
        distance *= 0.82
        orbit = Math.sin(now / 1800) * 0.18
      }
      shake *= Math.exp(-dtSec * 9)
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      camera.position.set(
        Math.sin(orbit) * distance + (Math.random() - 0.5) * shake,
        height + (Math.random() - 0.5) * shake,
        Math.cos(orbit) * distance + (Math.random() - 0.5) * shake * 0.4,
      )
      camera.lookAt(0, 1.35, 0)
      beam.rotation.y += dtSec * 0.2
    },
    dispose() {
      clearFighters()
      for (const fx of fxList) fx.sprite.material.dispose()
      fxList.length = 0
      for (const map of damageMaps.values()) map.dispose()
      crowd.dispose()
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      for (const t of texs) t.dispose()
    },
  }
}
