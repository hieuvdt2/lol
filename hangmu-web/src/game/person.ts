import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BodyPose } from './gait.ts'
import { makeHairGeometry, makeHeadGeometries } from './head.ts'
import { DEFAULT_LOOK, DEFAULT_LOOK_CODE, decodeLook, encodeLook, LOOK_LIMITS } from '../../shared/look.mjs'
import { HAIR_COLORS, SKIN_TONES, TEAM_KITS } from './kits.ts'
import type { Look } from '../../shared/look.mjs'
import { addAccessories, disposeAccessories } from './accessories.ts'
import type { Ride } from './accessories.ts'

export const BODY = {
  hipY: 0.55,
  hipX: 0.13,
  thighLen: 0.23,
  shinLen: 0.24,
  legR: 0.088,
  torsoR: 0.3,
  torsoLen: 0.34,
  torsoY: 1,
  headR: 0.25,
  headY: 1.66,
  shoulderY: 1.3,
  shoulderX: 0.34,
  upperArmLen: 0.22,
  foreArmLen: 0.2,
  armR: 0.075,
  handR: 0.092,
  footR: 0.105,
}

/** Đầu xoay quanh cổ (đáy hình cầu đầu), không phải quanh bàn chân. */
export const NECK_Y = BODY.headY - BODY.headR

export interface Footballer {
  group: THREE.Group
  /** Toàn bộ phần chi tiết; ẩn khi chuyển sang mức 'lite'. */
  detail: THREE.Group
  /** Biểu diễn đơn giản (1 draw call) cho nhân vật ở xa: tấm ảnh quay về camera, hoặc khối trụ nếu chưa có ảnh. */
  lite: THREE.Object3D
  name: string
  number: number | null
  /** Mã ngoại hình đã dùng để dựng nhân vật (shared/look.mjs). */
  look: number
  /** Xe lăn (nếu ngoại hình có): nhóm xe + hai bánh lớn để quay theo quãng đường. */
  ride: Ride | null
  lod: Lod
  extras: boolean
  torso: THREE.Object3D
  head: THREE.Object3D
  arms: [THREE.Object3D, THREE.Object3D]
  elbows: [THREE.Object3D, THREE.Object3D]
  legs: [THREE.Object3D, THREE.Object3D]
  knees: [THREE.Object3D, THREE.Object3D]
}

export function poseFootballer(actor: Footballer, phase: number, speed: number, sitting: boolean, punch: number): void {
  const moving = speed > 0.35 && !sitting
  const swing = moving ? Math.sin(phase) * 0.85 : Math.sin(phase * 0.35) * 0.06
  const lift = moving ? Math.max(0, Math.sin(phase)) * 0.45 : 0
  actor.legs[0].rotation.x = sitting ? -1.25 : swing
  actor.legs[1].rotation.x = sitting ? -1.25 : -swing
  actor.knees[0].rotation.x = sitting ? 1.35 : lift
  actor.knees[1].rotation.x = sitting ? 1.35 : moving ? Math.max(0, Math.sin(phase + Math.PI)) * 0.45 : 0
  const arm = sitting ? -0.25 : -swing * 0.75
  actor.arms[0].rotation.x = arm - punch
  actor.arms[1].rotation.x = sitting ? -0.25 : swing * 0.75
  actor.elbows[0].rotation.x = sitting ? -0.6 : -0.25 - Math.max(0, -swing) * 0.2
  actor.elbows[1].rotation.x = sitting ? -0.6 : -0.25 - Math.max(0, swing) * 0.2
  actor.torso.position.y = BODY.torsoY + (moving ? Math.abs(Math.sin(phase * 2)) * 0.035 : Math.sin(phase * 0.5) * 0.012)
  actor.head.rotation.x = sitting ? 0.2 : moving ? 0.05 : Math.sin(phase * 0.4) * 0.05
  actor.head.rotation.y = sitting ? 0 : moving ? 0 : Math.sin(phase * 0.25) * 0.18
}

/**
 * Áp một BodyPose (xem gait.ts) lên nhân vật. Thân nghiêng/xoay quanh vùng hông chứ không phải bàn chân,
 * nên chân không bị kéo lê khi chúi người; "bob" và "step" dịch cả người một chút.
 */
export function applyBodyPose(actor: Footballer, p: BodyPose): void {
  actor.legs[0].rotation.x = p.rLeg
  actor.legs[1].rotation.x = p.lLeg
  actor.knees[0].rotation.x = p.rKnee
  actor.knees[1].rotation.x = p.lKnee
  actor.arms[0].rotation.x = p.rArm
  actor.arms[1].rotation.x = p.lArm
  actor.elbows[0].rotation.x = p.rElbow
  actor.elbows[1].rotation.x = p.lElbow
  actor.head.rotation.x = p.headPitch
  actor.head.rotation.y = p.headYaw
  const d = actor.detail
  d.rotation.set(p.torsoLean, p.torsoTwist, -p.torsoRoll)
  // quay quanh điểm hông (0, hipY, 0): vị trí = hip − R·hip
  const sin = Math.sin(p.torsoLean)
  const cos = Math.cos(p.torsoLean)
  d.position.set(0, p.bob + BODY.hipY * (1 - cos), p.step - BODY.hipY * sin)
}

export type Lod = 'full' | 'lite'

/**
 * Tài nguyên dùng chung cho mọi nhân vật: texture, vật liệu và geometry chỉ tạo một lần.
 * Mỗi nhân vật chỉ còn tốn các Object3D (nhóm + mesh) và, khi lại gần, nhãn tên.
 */
interface TeamStyle {
  cloth: THREE.Material
  sleeve: THREE.Material
  sock: THREE.Material
  far: THREE.Material
  textures: THREE.Texture[]
  /** Ảnh nhân vật đứng yên (áo của đội này) cho mức chi tiết thấp; tạo khi cần (xem prepareImpostor). */
  impostor: THREE.WebGLRenderTarget | null
  impostorMaterial: THREE.SpriteMaterial | null
}

interface Kit {
  torso: THREE.BufferGeometry
  head: THREE.BufferGeometry
  /** Tóc theo kiểu (chỉ số = kiểu tóc). */
  hairs: THREE.BufferGeometry[]
  upperArm: THREE.BufferGeometry
  foreArmHand: THREE.BufferGeometry
  thigh: THREE.BufferGeometry
  shinFoot: THREE.BufferGeometry
  lite: THREE.BufferGeometry
  /** Áo, tay áo, quần theo đội: tạo lần đầu có người mặc áo đội đó, dùng chung cho mọi người cùng đội. */
  teams: Map<number, TeamStyle>
  /** Da mặt theo (màu da, màu tóc) — mép tóc vẽ trên ảnh mặt. */
  skins: Map<string, { material: THREE.Material; map: THREE.Texture }>
  hairColors: Map<number, THREE.Material>
  /** Renderer để vẽ ảnh nhân vật ở xa cho đội mới (có sau prepareImpostor). */
  renderer: THREE.WebGLRenderer | null
  /** Tên in sau lưng áo theo (tên, đội), có đếm tham chiếu. */
  backs: Map<string, { material: THREE.Material; map: THREE.Texture; refs: number }>
  backBand: THREE.BufferGeometry
  /** Nhãn tên có đếm tham chiếu: giải phóng khi không còn nhân vật nào dùng. */
  labels: Map<string, { material: THREE.SpriteMaterial; map: THREE.Texture; refs: number }>
}

let kit: Kit | null = null

function getKit(): Kit {
  if (kit) return kit
  const half = BODY.torsoLen / 2 + BODY.torsoR
  const profile: Array<[number, number]> = [
    [0, -half],
    [0.17, -half + 0.006],
    [0.255, -0.44],
    [0.292, -0.39],
    [0.297, -0.31],
    [0.286, -0.245],
    [0.3, -0.19],
    [0.3, 0.17],
    [0.305, 0.22],
    [0.296, 0.285],
    [0.262, 0.355],
    [0.195, 0.415],
    [0.105, 0.455],
    [0, half],
  ]
  const torso = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 22)
  const uv = torso.getAttribute('uv')
  const position = torso.getAttribute('position')
  for (let index = 0; index < uv.count; index += 1) {
    uv.setY(index, (position.getY(index) + half) / (2 * half))
  }
  torso.rotateY(-Math.PI / 2)

  const upperArm = new THREE.CylinderGeometry(BODY.armR, BODY.armR, BODY.upperArmLen, 8)
  upperArm.translate(0, -BODY.upperArmLen / 2, 0)
  // Cẳng tay và bàn tay dùng cùng vật liệu, cùng chuyển động theo khuỷu: gộp thành một mesh.
  const fore = new THREE.CylinderGeometry(BODY.armR * 0.94, BODY.armR * 0.9, BODY.foreArmLen, 8)
  fore.translate(0, -BODY.foreArmLen / 2, 0)
  const hand = new THREE.SphereGeometry(BODY.handR, 8, 6)
  hand.scale(0.9, 1, 1)
  hand.translate(0, -BODY.foreArmLen - BODY.handR * 0.4, 0)
  const foreArmHand = mergeGeometries([fore, hand])
  fore.dispose()
  hand.dispose()

  const thigh = new THREE.CylinderGeometry(BODY.legR, BODY.legR * 0.96, BODY.thighLen, 8)
  thigh.translate(0, -BODY.thighLen / 2, 0)
  const shin = new THREE.CylinderGeometry(BODY.legR * 0.92, BODY.legR * 0.86, BODY.shinLen, 8)
  shin.translate(0, -BODY.shinLen / 2, 0)
  const foot = new THREE.SphereGeometry(BODY.footR, 8, 6)
  foot.scale(0.95, 0.6, 1.6)
  foot.translate(0, -BODY.shinLen - 0.02, 0.06)
  const shinFoot = mergeGeometries([shin, foot])
  shin.dispose()
  foot.dispose()

  const { head } = makeHeadGeometries(BODY.headR, BODY.headY - NECK_Y)
  const hairs = Array.from({ length: LOOK_LIMITS.hair }, (_, style) => makeHairGeometry(style, BODY.headR, BODY.headY - NECK_Y, (parts) => mergeGeometries(parts)))

  const lite = new THREE.CapsuleGeometry(0.3, 1.2, 2, 6)
  lite.translate(0, 1.0, 0)

  kit = {
    torso, head, hairs, upperArm, foreArmHand, thigh, shinFoot, lite,
    teams: new Map(),
    skins: new Map(),
    hairColors: new Map(),
    renderer: null,
    backs: new Map(),
    // dải cong ôm lưng áo (mặt trụ hở, chỉ phần sau lưng: góc quanh π ứng với −z)
    backBand: new THREE.CylinderGeometry(0.309, 0.309, 0.12, 24, 1, true, Math.PI - 0.85, 1.7),
    labels: new Map(),
  }
  return kit
}

const IMPOSTOR_FEET = -0.05
const IMPOSTOR_HEIGHT = 2.1

/** Áo, tay áo, quần của một đội (tạo lần đầu, dùng chung). Đồng phục tự thiết kế theo màu đội, không phải đồng phục chính thức. */
function teamStyle(k: Kit, team: number): TeamStyle {
  let style = k.teams.get(team)
  if (style) return style
  const c = TEAM_KITS[team] ?? TEAM_KITS[DEFAULT_LOOK.team]!
  const shirt = jerseyTexture(c.base, c.accent, c.trim)
  const arm = stripeTexture([
    [0, 0.33, c.base],
    [0.33, 0.39, c.accent],
  ])
  const leg = stripeTexture([
    [0, 0.3, c.base],
    [0.3, 0.34, c.accent],
    [0.6, 0.66, c.trim],
    [0.66, 0.84, c.accent],
    [0.84, 1, c.base],
  ])
  style = {
    cloth: new THREE.MeshStandardMaterial({ map: shirt, roughness: 0.75 }),
    sleeve: new THREE.MeshStandardMaterial({ map: arm, roughness: 0.75 }),
    sock: new THREE.MeshStandardMaterial({ map: leg, roughness: 0.8 }),
    far: new THREE.MeshStandardMaterial({ color: c.far, roughness: 0.8 }),
    textures: [shirt, arm, leg],
    impostor: null,
    impostorMaterial: null,
  }
  k.teams.set(team, style)
  if (k.renderer) renderImpostor(k, team, style)
  return style
}

function skinMaterial(k: Kit, skin: number, hairColor: number): THREE.Material {
  const key = `${skin}:${hairColor}`
  let entry = k.skins.get(key)
  if (!entry) {
    const map = faceTexture(SKIN_TONES[skin] ?? SKIN_TONES[0], HAIR_COLORS[hairColor] ?? HAIR_COLORS[0])
    entry = { map, material: new THREE.MeshStandardMaterial({ map, roughness: 0.8 }) }
    k.skins.set(key, entry)
  }
  return entry.material
}

function hairMaterial(k: Kit, hairColor: number): THREE.Material {
  let material = k.hairColors.get(hairColor)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[hairColor] ?? HAIR_COLORS[0], roughness: 0.9 })
    k.hairColors.set(hairColor, material)
  }
  return material
}


/** Vẽ một nhân vật đứng yên (áo đội `team`, da/tóc mặc định) vào texture 256×512 nền trong suốt. */
function renderImpostor(k: Kit, team: number, style: TeamStyle): void {
  const renderer = k.renderer
  if (!renderer || style.impostor) return
  const target = new THREE.WebGLRenderTarget(256, 512, { samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#fff6e8', '#8a7560', 1.6))
  const sun = new THREE.DirectionalLight('#fff1d2', 1.6)
  sun.position.set(-2, 4, 6)
  scene.add(sun)
  const figure = buildFigure(k, '', null, { ...DEFAULT_LOOK, team }, false)
  poseFootballer(figure, 0, 0, false, 0)
  scene.add(figure.group)
  const half = IMPOSTOR_HEIGHT / 4
  const camera = new THREE.OrthographicCamera(-half, half, IMPOSTOR_FEET + IMPOSTOR_HEIGHT, IMPOSTOR_FEET, 0.1, 20)
  camera.position.set(0, 0, 6)
  const previousTarget = renderer.getRenderTarget()
  const previousColor = new THREE.Color()
  renderer.getClearColor(previousColor)
  const previousAlpha = renderer.getClearAlpha()
  renderer.setClearColor(0x000000, 0)
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(previousTarget)
  renderer.setClearColor(previousColor, previousAlpha)
  scene.remove(figure.group) // geometry/vật liệu là của kit dùng chung, không giải phóng ở đây
  style.impostor = target
  style.impostorMaterial = new THREE.SpriteMaterial({ map: target.texture, alphaTest: 0.5, transparent: false })
}

/**
 * Chuẩn bị "ảnh" nhân vật cho người ở xa. Cần renderer của cảnh nên phải gọi sau khi tạo renderer và trước khi tạo nhân vật.
 * Vẽ ngay ảnh áo mặc định; đội khác được vẽ khi có người đầu tiên mặc áo đội đó. Mất context WebGL thì gọi lại (sau disposeFootballerKit).
 */
export function prepareImpostor(renderer: THREE.WebGLRenderer): void {
  const k = getKit()
  k.renderer = renderer
  for (const [team, style] of k.teams) renderImpostor(k, team, style)
  teamStyle(k, DEFAULT_LOOK.team)
}

/** Đã có ảnh nhân vật cho mức chi tiết thấp chưa (kiểm thử dùng để chắc chắn không rơi về khối trụ). */
export function hasImpostor(): boolean {
  return kit?.teams.get(DEFAULT_LOOK.team)?.impostorMaterial != null
}

/** Giải phóng toàn bộ tài nguyên dùng chung (gọi khi rời hang). Lần sau tự tạo lại. */
export function disposeFootballerKit(): void {
  if (!kit) return
  const k = kit
  kit = null
  for (const style of k.teams.values()) {
    for (const m of [style.cloth, style.sleeve, style.sock, style.far]) m.dispose()
    for (const t of style.textures) t.dispose()
    style.impostor?.dispose()
    style.impostorMaterial?.dispose()
  }
  for (const { material, map } of k.skins.values()) {
    material.dispose()
    map.dispose()
  }
  for (const m of k.hairColors.values()) m.dispose()
  for (const g of [k.torso, k.head, ...k.hairs, k.upperArm, k.foreArmHand, k.thigh, k.shinFoot, k.lite, k.backBand]) g.dispose()
  for (const { material, map } of k.backs.values()) {
    material.dispose()
    map.dispose()
  }
  disposeAccessories()
  for (const { material, map } of k.labels.values()) {
    material.dispose()
    map.dispose()
  }
}

/** Nhân vật bị gỡ khỏi cảnh: trả lại tham chiếu nhãn tên, nhãn nào hết người dùng thì giải phóng. */
export function releaseFootballer(actor: Footballer): void {
  if (!kit || !actor.extras) return
  actor.extras = false
  if (actor.name.trim()) {
    const key = backKey(actor.name, decodeLook(actor.look).team)
    const back = kit.backs.get(key)
    if (back && --back.refs <= 0) {
      back.material.dispose()
      back.map.dispose()
      kit.backs.delete(key)
    }
  }
  const entry = kit.labels.get(actor.name)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs <= 0) {
    entry.material.dispose()
    entry.map.dispose()
    kit.labels.delete(actor.name)
  }
}

const BACK_NAME_Y = 1.1
const backKey = (name: string, team: number) => `${team}|${name}`

/** Tên in sau lưng: chữ in hoa màu nhấn của đội, viền màu thân áo; tên dài thì thu nhỏ chữ cho vừa. */
function backNameFor(k: Kit, name: string, team: number) {
  const key = backKey(name, team)
  let entry = k.backs.get(key)
  if (!entry) {
    const c = TEAM_KITS[team] ?? TEAM_KITS[DEFAULT_LOOK.team]!
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 96
    const g = canvas.getContext('2d')
    if (g) {
      const text = name.trim().toLocaleUpperCase('vi')
      let size = 70
      g.font = `900 ${size}px "Be Vietnam Pro", system-ui, sans-serif`
      while (size > 26 && g.measureText(text).width > 480) {
        size -= 4
        g.font = `900 ${size}px "Be Vietnam Pro", system-ui, sans-serif`
      }
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      g.lineWidth = 8
      g.strokeStyle = c.base
      g.strokeText(text, 256, 52)
      g.fillStyle = brightest(c.accent, c.trim)
      g.fillText(text, 256, 52)
    }
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    entry = { map, material: new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.2, roughness: 0.75, depthWrite: false }), refs: 0 }
    k.backs.set(key, entry)
  }
  entry.refs += 1
  return entry
}

/** Màu sáng hơn trong hai màu (để chữ / gậy phát sáng nổi trên áo). */
function brightest(a: string, b: string): string {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
  }
  return lum(a) >= lum(b) ? a : b
}

function labelFor(k: Kit, name: string) {
  let entry = k.labels.get(name)
  if (!entry) {
    const sprite = nameSprite(name)
    entry = { material: sprite.material, map: sprite.material.map as THREE.Texture, refs: 0 }
    k.labels.set(name, entry)
  }
  entry.refs += 1
  return entry
}

/** Tạo nhân vật với ngoại hình `look` (mã trong shared/look.mjs; bỏ trống = mặc định). */
export function makeFootballer(name: string, number: number | null, look: number = DEFAULT_LOOK_CODE): Footballer {
  return buildFigure(getKit(), name, number, decodeLook(look), true)
}

function buildFigure(k: Kit, name: string, number: number | null, look: Look, withLite: boolean): Footballer {
  const style = teamStyle(k, look.team)
  const group = new THREE.Group()
  const detail = new THREE.Group()
  group.add(detail)

  const body = new THREE.Mesh(k.torso, style.cloth)
  body.position.y = BODY.torsoY
  detail.add(body)
  // Đầu và tóc nằm chung một nhóm đặt ở cổ: nghiêng/quay thì mặt, tóc và thân vẫn dính liền
  // (trước đây mỗi mảnh xoay quanh gốc toạ độ ở chân nên đầu văng khỏi thân khi bị đấm, còn tóc đứng yên khi mặt quay).
  const head = new THREE.Group()
  head.position.y = NECK_Y
  head.add(new THREE.Mesh(k.head, skinMaterial(k, look.skin, look.hairColor)), new THREE.Mesh(k.hairs[look.hair] ?? k.hairs[0]!, hairMaterial(k, look.hairColor)))
  detail.add(head)

  const rightArm = addArm(detail, k, style, 1)
  const leftArm = addArm(detail, k, style, -1)
  const rightLeg = addLeg(detail, k, style, 1)
  const leftLeg = addLeg(detail, k, style, -1)
  const kitColors = TEAM_KITS[look.team] ?? TEAM_KITS[DEFAULT_LOOK.team]!
  const ride = addAccessories({ head, detail, rightElbow: rightArm.elbow, root: group }, look, {
    headCentre: BODY.headY - NECK_Y,
    headR: BODY.headR,
    stickColor: brightest(kitColors.base, kitColors.accent),
  })

  let lite: THREE.Object3D
  if (withLite && style.impostorMaterial) {
    const sprite = new THREE.Sprite(style.impostorMaterial)
    sprite.center.set(0.5, 0)
    sprite.position.y = IMPOSTOR_FEET
    sprite.scale.set(IMPOSTOR_HEIGHT / 2, IMPOSTOR_HEIGHT, 1)
    lite = sprite
  } else {
    lite = new THREE.Mesh(k.lite, style.far)
  }
  lite.visible = false
  group.add(lite)

  return {
    group,
    detail,
    lite,
    name,
    number,
    look: encodeLook(look),
    ride,
    lod: 'full',
    extras: false,
    torso: body,
    head,
    arms: [rightArm.shoulder, leftArm.shoulder],
    elbows: [rightArm.elbow, leftArm.elbow],
    legs: [rightLeg.hip, leftLeg.hip],
    knees: [rightLeg.knee, leftLeg.knee],
  }
}

/** Chuyển mức chi tiết. Nhãn tên chỉ được tạo lần đầu khi nhân vật cần vẽ đầy đủ. Áo không in số (áo esport không có số). */
export function setFootballerLod(actor: Footballer, lod: Lod): void {
  if (actor.lod === lod && (lod === 'lite' || actor.extras)) return
  actor.lod = lod
  actor.detail.visible = lod === 'full'
  actor.lite.visible = lod === 'lite'
  if (lod === 'full' && !actor.extras) {
    actor.extras = true
    const k = getKit()
    const label = new THREE.Sprite(labelFor(k, actor.name).material)
    label.scale.set(1.8, 0.34, 1)
    label.position.y = 2.15
    actor.detail.add(label)
    // tên in sau lưng áo (như áo đấu esport: tên trong game thay cho số áo)
    if (actor.name.trim()) {
      const back = new THREE.Mesh(k.backBand, backNameFor(k, actor.name, decodeLook(actor.look).team).material)
      back.position.y = BACK_NAME_Y
      actor.detail.add(back)
    }
  }
  if (actor.ride) actor.ride.group.visible = lod === 'full'
}

function addArm(group: THREE.Group, k: Kit, style: TeamStyle, side: 1 | -1): { shoulder: THREE.Group; elbow: THREE.Group } {
  const shoulder = new THREE.Group()
  shoulder.position.set(BODY.shoulderX * side, BODY.shoulderY, 0)
  shoulder.rotation.z = side * 0.15
  const elbow = new THREE.Group()
  elbow.position.y = -BODY.upperArmLen
  elbow.add(new THREE.Mesh(k.foreArmHand, style.sleeve))
  shoulder.add(new THREE.Mesh(k.upperArm, style.sleeve), elbow)
  group.add(shoulder)
  return { shoulder, elbow }
}

function addLeg(group: THREE.Group, k: Kit, style: TeamStyle, side: 1 | -1): { hip: THREE.Group; knee: THREE.Group } {
  const hip = new THREE.Group()
  hip.position.set(BODY.hipX * side, BODY.hipY, 0)
  const knee = new THREE.Group()
  knee.position.y = -BODY.thighLen
  knee.add(new THREE.Mesh(k.shinFoot, style.sock))
  hip.add(new THREE.Mesh(k.thigh, style.sock), knee)
  group.add(hip)
  return { hip, knee }
}

function jerseyTexture(base: string, accent: string, trim: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  context.fillStyle = base
  context.fillRect(0, 0, 512, 256)
  const shade = context.createLinearGradient(0, 0, 512, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0.05)')
  shade.addColorStop(0.25, 'rgba(0,0,0,0.14)')
  shade.addColorStop(0.5, 'rgba(0,0,0,0)')
  shade.addColorStop(0.75, 'rgba(0,0,0,0.14)')
  shade.addColorStop(1, 'rgba(0,0,0,0.05)')
  context.fillStyle = shade
  context.fillRect(0, 0, 512, 184)
  // hai dải màu nhấn chéo hai bên thân (ngoài mặt chính diện), vai màu nhấn
  context.fillStyle = accent
  context.fillRect(0, 15, 512, 12)
  context.beginPath()
  context.moveTo(0, 60)
  context.lineTo(96, 40)
  context.lineTo(96, 184)
  context.lineTo(0, 184)
  context.closePath()
  context.fill()
  context.beginPath()
  context.moveTo(512, 60)
  context.lineTo(416, 40)
  context.lineTo(416, 184)
  context.lineTo(512, 184)
  context.closePath()
  context.fill()
  context.fillStyle = trim
  context.beginPath()
  context.moveTo(222, 20)
  context.lineTo(256, 61)
  context.lineTo(290, 20)
  context.lineTo(278, 20)
  context.lineTo(256, 49)
  context.lineTo(234, 20)
  context.closePath()
  context.fill()
  context.fillStyle = trim
  context.fillRect(0, 184, 512, 6)
  context.fillStyle = base
  context.fillRect(0, 190, 512, 66)
  context.fillStyle = accent
  context.fillRect(0, 238, 512, 6)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.offset.x = 0.25
  return texture
}

function faceTexture(skin: string, hair: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  context.fillStyle = skin
  context.fillRect(0, 0, 256, 128)
  context.fillStyle = hair // mép tóc trên trán
  context.fillRect(0, 0, 256, 36)
  context.fillStyle = '#1b130e'
  for (const x of [96, 150]) {
    context.beginPath()
    context.ellipse(x, 62, 7, 8, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = '#ffffff'
  for (const x of [94, 148]) {
    context.beginPath()
    context.arc(x, 60, 2, 0, Math.PI * 2)
    context.fill()
  }
  context.strokeStyle = '#8a4b3a'
  context.lineWidth = 2
  context.beginPath()
  context.arc(128, 88, 8, 0.15 * Math.PI, 0.85 * Math.PI)
  context.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function stripeTexture(bands: Array<[number, number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  for (const [from, to, color] of bands) {
    context.fillStyle = color
    context.fillRect(0, from * 128, 16, (to - from) * 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function nameSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) return new THREE.Sprite()
  context.fillStyle = 'rgba(20,12,8,0.55)'
  context.fillRect(40, 16, 432, 64)
  context.fillStyle = '#efe9dd'
  context.font = '600 40px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 256, 48)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.8, 0.34, 1)
  return sprite
}
