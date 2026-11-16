import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import * as THREE from 'three'
import { NICKNAMES } from '../game/rage.ts'
import { aimToNdc } from '../game/rageMath.ts'
import { createRageRing } from '../game/rageRing.ts'
import type { RageRing } from '../game/rageRing.ts'
import { createArena } from '../game/arena.ts'
import type { Arena } from '../game/arena.ts'
import { addCaveScenery } from '../game/caveMesh.ts'
import { createHangingBoard } from '../game/hangingBoard.ts'
import { viewDistanceScale, viewFov } from '../game/view.ts'
import { NetClient } from '../game/net.ts'
import type { Actor } from '../game/net.ts'
import { QUICK_CHAT } from '../content/quickChat.ts'
import { TELEGRAM_URL } from '../content/legal.ts'
import { Gait, type BodyPose } from '../game/gait.ts'
import { disposeFootballerKit, hasImpostor, applyBodyPose, makeFootballer, prepareImpostor, releaseFootballer, setFootballerLod } from '../game/person.ts'
import { animateRide, newRideState, settleRide } from '../game/wheelchair.ts'
import type { RideState } from '../game/wheelchair.ts'
import type { Footballer } from '../game/person.ts'
import { audio } from '../game/audio.ts'
import { CHAT_MAX_CHARS, INVITE_RANGE } from '../game/protocol.ts'
import { gateDestination, standUpSpot, zoneAt, zonePrompt } from '../game/zones.ts'
import type { Seat } from '../game/world.ts'
import { CAMERA_CLEARANCE, solidTop } from '../game/cameraGuard.ts'
import { baseDistance, cameraSpot, clearDistance, easeDistance } from '../game/cameraRig.ts'
import { SHOW_FAKE_PEOPLE } from '../game/layout.ts'
import type { SavedIdentity } from '../types.ts'
import { BoardPanel } from './BoardPanel.tsx'
import { DebugHud } from './DebugHud.tsx'
import { DuelOverlay } from './DuelOverlay.tsx'
import { TrapOverlay } from './TrapOverlay.tsx'
import { Donate } from './Donate.tsx'
import { KeyHelp } from './KeyHelp.tsx'
import { LegalDialog } from './LegalDialog.tsx'
import { WeeklyBoard } from './WeeklyBoard.tsx'
import { CharacterDialog } from './CharacterDialog.tsx'
import { LckWidget } from './LckWidget.tsx'
import { NoticeToast } from './NoticeToast.tsx'
import { RagePanel } from './RagePanel.tsx'
import { RankPanel } from './RankPanel.tsx'
import { VolumePanel } from './VolumePanel.tsx'
import { TouchControls } from './TouchControls.tsx'
import type { JoyVector } from './TouchControls.tsx'
import { ConnectionBanner, InviteBar, PollCard, PunchFlash, StatusOverlay, TalkPanel } from './HangOverlays.tsx'
import { hitDirection, turnToward } from '../game/targeting.ts'
import { punchShake } from '../game/punchFx.ts'
import { createImpactFx } from '../game/impact.ts'
import { createConfetti } from '../game/confetti.ts'
import { bubbleSprite } from '../game/bubble.ts'
import { TEAM_KITS } from '../game/kits.ts'
import { decodeLook } from '../../shared/look.mjs'
import { createVideoScreen } from '../game/videoScreen.ts'
import { createShadowBlobs } from '../game/shadows.ts'
import type { VideoScreen } from '../game/videoScreen.ts'
import { TvPanel } from './TvPanel.tsx'

interface HangProps {
  identity: SavedIdentity
  /** Đổi trang phục trong hang: App lưu lại (máy + server). */
  onOutfit?: (identity: SavedIdentity) => void
  onLeave: () => void
}

interface Mesh {
  actor: Footballer
  gait: Gait
  lastHeading: number
  lastSpeed: number
  lastAt: number
  /** Dấu thời gian của các sự kiện hoạt hình đã xử lý (để mỗi sự kiện chỉ kích hoạt một lần). */
  seenPunch: number
  seenHurt: number
  seenHit: number
  seenEmote: number
  /** Mốc các cú vung/bị đấm của người khác đã xử lý. */
  seenSwing: number
  seenHurtRemote: number
  /** Độ xoay thêm (rad) về phía mục tiêu khi ra đòn — chỉ hiển thị, không ảnh hưởng hướng thật. */
  yawBias: number
  /** Nhịp tay đẩy bánh xe lăn. */
  /** trạng thái đẩy xe lăn (nhịp đẩy, nghiêng thân, bánh trước) */
  ride: RideState
  bubbleText: string
  bubble: THREE.Sprite | null
}

const IDLE_HINT = 'WASD đi theo hướng nhìn. Di chuột để quay. Bấm vào cảnh để khóa chuột. F đấm, E ngồi.'
const TOUCH_HINT = 'Kéo cần bên trái để đi, kéo màn hình để nhìn. 👊 để đấm, 🪑 để ngồi.'
/** Gợi ý là một thao tác cụ thể ("… bấm E để ngồi", "bấm F để đấm") thì hiện nổi bật; câu hướng dẫn chung thì không. */
const ACTION_KEY = /([Bb]ấm )([A-Z]|🪑|👊)(?=[\s.,]|$)/
const isActionHint = (text: string): boolean => text !== IDLE_HINT && text !== TOUCH_HINT && ACTION_KEY.test(text)
/** Chữ gợi ý với phím bấm vẽ thành ô phím (giữ nguyên nội dung chữ để đọc màn hình và kiểm thử). */
function renderHint(text: string): ReactNode {
  const parts = text.split(new RegExp(ACTION_KEY.source, 'g'))
  if (parts.length === 1) return text
  const out: ReactNode[] = []
  for (let i = 0; i < parts.length; i += 3) {
    out.push(parts[i])
    if (i + 2 < parts.length) out.push(parts[i + 1], <kbd key={i}>{parts[i + 2]}</kbd>)
  }
  return out
}
const DEAD_ZONE = 0.12
/** Camera nhìn vào điểm cao cỡ này trên người chơi (cao hơn đầu một chút để đường chân trời và bảng treo nằm giữa màn hình, như bản gốc). */
const CAMERA_LOOK_HEIGHT = 2.6
/** Tỉ lệ dịch khung nhìn lên (so với chiều cao) khi ném đồ trên màn hình hẹp; zoom kèm theo là 1 + 2×giá trị này. */
const RAGE_VIEW_SHIFT = 0.1
/**
 * Mức chi tiết của nhân vật khác. Kích thước trên màn hình phụ thuộc khoảng cách tới CAMERA (đứng sau lưng người chơi),
 * không phải tới người chơi, nên xếp hạng theo camera và chỉ xét người trong khung nhìn. Nhân vật ngoài khung nhìn không
 * tốn gì (bị cắt) nên để ở mức đơn giản. Tối đa MAX_FULL người gần camera nhất, trong FULL_KEEP / FULL_TAKE (đơn vị thế giới)
 * mới vẽ đầy đủ; hai ngưỡng lệch nhau để không nhấp nháy ở biên.
 */
const MAX_FULL = 80
const FULL_KEEP = 46
const FULL_TAKE = 42
const FULL_BIAS = 0.85 // đang vẽ đầy đủ thì được ưu tiên khi xếp hạng, tránh đổi qua lại giữa hai người gần cùng khoảng cách
const LITE_HEIGHT = 2.1 // chiều cao tấm ảnh nhân vật ở xa (đơn vị thế giới), dùng để đo kích thước trên màn hình trong chế độ dev

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

export function Hang({ identity, onLeave, onOutfit }: HangProps) {
  const host = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLInputElement>(null)
  const onLeaveRef = useRef(onLeave)
  const [net] = useState(() => new NetClient())
  const state = useSyncExternalStore(net.subscribe, net.getState)
  const dueling = useSyncExternalStore(net.duel.subscribe, net.duel.getSnapshot).phase !== 'idle'
  const trapping = useSyncExternalStore(net.trap.subscribe, net.trap.getSnapshot).phase !== 'idle'
  /** đang trong trò hai người (võ / Bẫy Độc Noxus): ẩn các bảng khác */
  const gameOn = dueling || trapping
  const [draft, setDraft] = useState('')
  const mainRef = useRef<HTMLElement>(null)
  const numberRef = useRef(identity.number)
  // Mã ngoại hình lúc vào hang; đổi trang phục trong hang đi qua net.changeLook, không kết nối lại (nên không là phụ thuộc của effect kết nối).
  const lookRef = useRef(identity.look)
  const headerRef = useRef<HTMLElement>(null)
  const [touch] = useState(isTouchDevice)
  const [hint, setHint] = useState(touch ? TOUCH_HINT : IDLE_HINT)
  const [chatOpen, setChatOpen] = useState(false)
  const muted = useSyncExternalStore(audio.subscribe, audio.getMuted)
  const [debug] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  const [seatNear, setSeatNear] = useState(false)
  const [sitting, setSitting] = useState(false)
  const [outfitOpen, setOutfitOpen] = useState(false)
  const [rageOpen, setRageOpen] = useState(false)
  const [rankOpen, setRankOpen] = useState(false)
  const [tvOpen, setTvOpen] = useState(false)
  const [tvPlaying, setTvPlaying] = useState(false)
  const tvRef = useRef<VideoScreen | null>(null)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [chatHidden, setChatHidden] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [chatFocused, setChatFocused] = useState(false)
  const quickOpenRef = useRef(false)
  /** Lúc ô chat tự đóng sau khi gửi: Esc ngay sau đó (thói quen 'thoát ô chat') không được làm rời hang. */
  const chatClosedAtRef = useRef(-Infinity)
  const volume = useSyncExternalStore(audio.subscribe, audio.getVolume)
  const rageOpenRef = useRef(false)
  const [near, setNear] = useState<{ index: number; name: string; bot: boolean } | null>(null)
  const sittingRef = useRef(false)
  const seatRef = useRef<Seat | null>(null)
  const joy = useRef<JoyVector>({ x: 0, y: 0 })
  const actions = useRef<{ punch: () => void; sit: () => void }>({ punch: () => {}, sit: () => {} })

  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])
  useEffect(() => {
    numberRef.current = identity.number
  }, [identity.number])
  useEffect(() => {
    rageOpenRef.current = rageOpen
  }, [rageOpen])
  useEffect(() => {
    quickOpenRef.current = quickOpen
  }, [quickOpen])
  // Đang khoá chuột thì con trỏ bị ẩn và mọi cú bấm rơi vào cảnh: người được mời không bấm được "Đồng ý", chat riêng/duel cũng vậy.
  // Có lời mời, đang mời, chat riêng hoặc trận đấu thì nhả khoá để dùng chuột bình thường.
  const needsCursor = state.invite !== null || state.asking !== null || state.conv !== null || gameOn
  useEffect(() => {
    if (needsCursor && document.pointerLockElement) document.exitPointerLock()
  }, [needsCursor])
  // Các khung đặt ngay dưới thanh tiêu đề dùng biến --top-h (đáy thật của thanh) thay vì số cứng, vì chiều cao của nó đổi theo màn hình/chữ.
  useEffect(() => {
    const main = mainRef.current
    const header = headerRef.current
    if (!main || !header) return
    const apply = () => main.style.setProperty('--top-h', `${Math.ceil(header.getBoundingClientRect().bottom)}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    sittingRef.current = sitting
  }, [sitting])

  useEffect(() => {
    // Chỉ ở chế độ dev: cho phép kịch bản kiểm thử đọc trạng thái thật.
    if (import.meta.env.DEV) (window as unknown as { __hangNet?: NetClient }).__hangNet = net
    net.connect(identity.name, identity.number, lookRef.current)
    return () => net.dispose()
  }, [net, identity.name, identity.number])

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
    // alpha: mặt phẳng màn hình lớn "đục lỗ" canvas để lộ trình phát YouTube nằm ở lớp CSS3D bên dưới (xem videoScreen.ts)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    prepareImpostor(renderer)
    const impact = createImpactFx(scene)
    let localLunge = 0 // độ xô tới của người chơi khi ra đòn: camera đẩy theo để thấy cú đấm
    let arena: Arena | null = null
    let rageActive = false
    let appliedViewKey = ''
    const rageEye = new THREE.Vector3()
    const rageLook = new THREE.Vector3()
    const rageGoalEye = new THREE.Vector3()
    const rageGoalLook = new THREE.Vector3()
    let arenaKey = ''
    const lodStats = { full: 0, liteVisible: 0, liteMaxPx: 0 }
    /** Số đo độ mượt của nhân vật mình (dev): tốc độ quay lớn nhất của một khớp (rad/s theo thời gian hoạt hình). */
    const animStats: { frames: number; maxJump: number; prev: BodyPose | null } = { frames: 0, maxJump: 0, prev: null }
    const frustum = new THREE.Frustum()
    const projScreen = new THREE.Matrix4()
    const sphere = new THREE.Sphere()
    if (import.meta.env.DEV) {
      // Chỉ ở chế độ dev: cho script đo hiệu năng đọc thống kê tài nguyên của Three.js.
      ;(window as unknown as { __hangStats?: () => unknown }).__hangStats = () => ({
        ...renderer.info.memory,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        actors: net.actors.size,
        confetti: confetti.count,
        cameraAt: camera.position.toArray(),
        me: net.local ? [net.local.draw.x, net.local.draw.y, net.local.draw.z] : null,
        full: lodStats.full,
        liteVisible: lodStats.liteVisible,
        liteMaxPx: Math.round(lodStats.liteMaxPx),
        impostor: hasImpostor(),
        arena: arena !== null,
        rageActive: rageActive,
        rageFlying: ring.flying,
        rageSplats: ring.splats,
        arenaFighters: arena?.fighterCount ?? 0,
        boardScreen: (() => {
          const box = new THREE.Box3().setFromObject(venue.crown) // màn hình trung tâm duy nhất (vương miện LED)
          const v = new THREE.Vector3()
          let minX = Infinity
          let maxX = -Infinity
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            v.set(x, y, z).project(camera)
            minX = Math.min(minX, ((v.x + 1) / 2) * el.clientWidth)
            maxX = Math.max(maxX, ((v.x + 1) / 2) * el.clientWidth)
          }
          return { minX, maxX, width: el.clientWidth }
        })(),
        rides: [...meshes.entries()].filter(([, m]) => m.actor.ride).map(([i, m]) => ({ i, visible: m.actor.ride!.group.visible, wheel: m.actor.ride!.wheels[0]!.rotation.x, chairY: m.actor.ride!.group.position.y })),
        animMaxSpeed: animStats.maxJump,
        animFrames: animStats.frames,
        animReset: () => {
          animStats.maxJump = 0
          animStats.frames = 0
          animStats.prev = null
        },
      })
    }

    const trash: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = []
    const venue = addCaveScenery(scene, trash)
    const tv = createVideoScreen(scene, el, trash)
    const blobs = createShadowBlobs(scene)
    // Chế độ nhẹ (localStorage `hangmu.lite` = '1'): chỉ vẽ ≤ ~16 khung/giây, phần logic vẫn chạy mỗi khung. Dành cho máy rất yếu
    // và cho bộ kiểm thử WebGL phần mềm (nhiều trang chạy cùng lúc không bị bỏ đói CPU).
    const liteRender = (() => {
      try {
        return localStorage.getItem('hangmu.lite') === '1'
      } catch {
        return false
      }
    })()
    let lastRenderAt = -Infinity
    // pháo giấy khi ăn mừng: ít mảnh hơn ở chế độ nhẹ / khi người dùng muốn giảm chuyển động
    const fewer = liteRender || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const confetti = createConfetti(scene, fewer ? 600 : 1500)
    const teamColors = (look: number): string[] => {
      const kit = TEAM_KITS[decodeLook(look).team]
      return kit ? [kit.base, kit.accent] : []
    }
    tvRef.current = tv
    renderer.domElement.style.zIndex = '1'
    // Hai bảng xếp hạng LCK gắn vách bắc (nội dung tĩnh).
    const hangingBoard = createHangingBoard(scene, trash)

    const ring: RageRing = createRageRing(scene)
    const applyLabels = () => ring.setLabels(net.rage.getSnapshot().labels.map((i) => NICKNAMES[i] ?? ''))
    applyLabels()
    let lastLabels = net.rage.getSnapshot().labels
    const stopRageLabels = net.rage.subscribe(() => {
      const labels = net.rage.getSnapshot().labels
      if (labels !== lastLabels) {
        lastLabels = labels
        applyLabels()
      }
    })
    const stopRageThrow = net.rage.onThrow((t) => ring.throwItem({ ...t, camera, now: performance.now() }))

    // Mỗi diễn viên có mesh riêng, tạo khi vào hang và gỡ khi rời.
    const meshes = new Map<number, Mesh>()
    const dropMesh = (index: number) => {
      const mesh = meshes.get(index)
      if (!mesh) return
      scene.remove(mesh.actor.group)
      clearBubble(mesh)
      releaseFootballer(mesh.actor)
      meshes.delete(index)
    }
    const ensureMesh = (a: Actor): Mesh => {
      const known = meshes.get(a.index)
      if (known && known.actor.look === a.look) return known
      if (known) dropMesh(a.index) // người này vừa đổi trang phục: dựng lại nhân vật
      const actor = makeFootballer(a.name || 'Ẩn danh', a.number, a.look)
      scene.add(actor.group)
      const mesh: Mesh = { actor, gait: new Gait(a.index), lastHeading: a.draw.heading, lastSpeed: 0, lastAt: 0, seenPunch: net.punchAnimAt, seenHurt: net.punchedAt, seenHit: net.punchHitAt, seenEmote: net.emotedAt.get(a.index) ?? -Infinity, seenSwing: net.swings.get(a.index)?.at ?? -Infinity, seenHurtRemote: net.hurts.get(a.index)?.at ?? -Infinity, yawBias: 0, ride: newRideState(), bubbleText: '', bubble: null }
      meshes.set(a.index, mesh)
      return mesh
    }
    const clearBubble = (mesh: Mesh) => {
      if (!mesh.bubble) return
      mesh.actor.group.remove(mesh.bubble)
      mesh.bubble.material.map?.dispose()
      mesh.bubble.material.dispose()
      mesh.bubble = null
      mesh.bubbleText = ''
    }
    const setBubble = (index: number, mesh: Mesh, text: string) => {
      if (mesh.bubbleText === text) return
      clearBubble(mesh)
      if (!text) return
      mesh.bubbleText = text
      const sprite = bubbleSprite(text)
      sprite.position.y = 2.43 // mũi nhọn của bong bóng; câu dài thì bong bóng cao lên phía trên
      mesh.actor.group.add(sprite)
      mesh.bubble = sprite
      void index
    }

    let yaw = 0
    let pitch = 0.14
    let camDistance = -1 // khoảng cách camera đang dùng (−1: chưa có)
    // Móc cho bộ kiểm thử trình duyệt: đặt hướng nhìn của camera (rad; 0 = nhìn về −z, −π/2 = nhìn về +x).
    ;(window as unknown as { __hangSetYaw?: (value: number, pitchValue?: number) => void }).__hangSetYaw = (value, pitchValue) => {
      yaw = value
      if (pitchValue !== undefined) pitch = pitchValue
    }
    let edge = 0
    let aimX = 0
    let aimY = 0
    let aimReady = false
    const held = new Set<string>()
    const rotateLook = (dx: number, dy: number) => {
      yaw -= dx * 0.0036
      pitch = Math.min(0.72, Math.max(-0.3, pitch + dy * 0.0024))
    }
    let lookId: number | null = null
    let lookX = 0
    let lookY = 0
    const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement

    const onPointerDown = (event: PointerEvent) => {
      if (rageOpenRef.current && !net.gaming) {
        // Chế độ ném đồ: bấm/chạm vào cảnh = ném đúng điểm đó (tọa độ chuẩn hóa so với khung vẽ).
        if ((event.pointerType === 'touch' || event.button === 0) && event.target instanceof HTMLCanvasElement) {
          const { u, v } = aimToNdc(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect())
          net.rage.throwAt(u, v)
        }
        return
      }
      if (net.duel.active) {
        if (event.button === 0) net.duel.block()
        else if (event.button === 2) net.duel.punch()
        return
      }
      if (event.pointerType === 'touch') {
        if (event.target instanceof HTMLCanvasElement && lookId === null) {
          lookId = event.pointerId
          lookX = event.clientX
          lookY = event.clientY
        }
        return
      }
      if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return
      if (document.pointerLockElement) {
        if (!sittingRef.current) net.punch()
        return
      }
      if (event.currentTarget instanceof HTMLElement) event.currentTarget.requestPointerLock()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        if (event.pointerId === lookId) {
          rotateLook((event.clientX - lookX) * 1.4, (event.clientY - lookY) * 1.4)
          lookX = event.clientX
          lookY = event.clientY
        }
        return
      }
      if (document.pointerLockElement) {
        rotateLook(event.movementX, event.movementY)
        edge = 0
        return
      }
      if (event.pointerType !== 'mouse') return
      if (aimReady) rotateLook(event.clientX - aimX, event.clientY - aimY)
      aimX = event.clientX
      aimY = event.clientY
      aimReady = true
      if (typing()) {
        edge = 0
        return
      }
      const bounds = el.getBoundingClientRect()
      const across = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
      edge = across < 0.07 ? -(1 - across / 0.07) : across > 0.93 ? (across - 0.93) / 0.07 : 0
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId === lookId) lookId = null
    }
    const onPointerLeave = () => {
      edge = 0
      aimReady = false
    }
    const onContextMenu = (event: Event) => net.duel.active && event.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('pointerup', onPointerEnd)
    el.addEventListener('pointercancel', onPointerEnd)

    const toggleSit = () => {
      const me = net.local
      if (!me) return
      if (sittingRef.current) {
        const seat = seatRef.current
        if (seat) net.standUpAt(standUpSpot(seat))
        seatRef.current = null
        sittingRef.current = false
        setSitting(false)
        setHint('Đứng dậy rồi.')
        return
      }
      const others = [...net.actors.values()].filter((a) => !a.local).map((a) => ({ x: a.curr.x, z: a.curr.z }))
      const zone = zoneAt({ x: me.curr.x, z: me.curr.z }, others)
      if (zone?.kind === 'gate') {
        net.passGate(zone.gate, gateDestination(zone.gate, zone.enter))
        setHint(zone.enter ? `Đã vào ${zone.label}.` : `Đã ra khỏi ${zone.label}.`)
        return
      }
      if (!zone || !('seat' in zone)) return
      net.sitAt(zone.seat, zone.seat.heading)
      seatRef.current = zone.seat
      sittingRef.current = true
      setSitting(true)
      const up = touch ? 'Bấm 🪑 để đứng dậy' : 'Bấm E để đứng dậy'
      setHint(zone.seat.zone === 'lounge' ? `Đang ngồi ở phòng chờ. ${up}.` : zone.seat.zone === 'stand' ? `Đang ngồi ở khán đài. ${up}.` : `Đang ngồi hội trường. ${up}. Micro không nối ra ngoài.`)
    }
    const doPunch = () => {
      if (!sittingRef.current) net.punch()
    }
    actions.current = { punch: doPunch, sit: toggleSit }

    // Trình duyệt chỉ cho phát âm thanh sau một thao tác của người dùng: mở khóa ở lần chạm/phím đầu tiên.
    const unlockAudio = () => audio.unlock()
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)

    const onKeyDown = (event: KeyboardEvent) => {
      // Hộp thoại trang phục đang mở: phím thuộc về hộp thoại (Esc đóng hộp thoại chứ không rời hang, E/WASD không điều khiển nhân vật).
      if (document.querySelector('.char-dialog')) {
        held.clear()
        return
      }
      const invite = net.getState().invite
      if (invite && !typing() && !event.repeat) {
        // Có lời mời: Y / Enter = đồng ý, N / Esc = từ chối (không cần chuột).
        if (event.code === 'KeyY' || event.code === 'Enter') {
          event.preventDefault()
          net.answer(true)
          return
        }
        if (event.code === 'KeyN' || event.key === 'Escape') {
          event.preventDefault()
          net.answer(false)
          return
        }
      }
      if (net.duel.active) {
        if (event.key === 'Escape') net.duel.askQuit()
        else if (!typing() && event.code === 'KeyJ') net.duel.punch()
        else if (!typing() && event.code === 'KeyK') net.duel.block()
        return
      }
      // Bẫy Độc Noxus: 1–2 chọn ô (trái/phải) ở hàng kế tiếp, Enter giấu nấm xong, Esc hỏi bỏ cuộc / đóng màn kết quả
      if (net.trap.active) {
        const tv = net.trap.getSnapshot()
        if (event.key === 'Escape') {
          if (tv.phase === 'ended') net.trap.close()
          else if (tv.confirmQuit) net.trap.cancelQuit()
          else net.trap.askQuit()
        } else if (!typing() && !event.repeat) {
          const col = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
          if (col && tv.phase === 'walk') net.trap.step(Number(col[1]) - 1)
          else if (event.code === 'Enter' && tv.phase === 'place') net.trap.confirmPlace()
        }
        return
      }
      if (rageOpenRef.current && !typing() && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
        event.preventDefault()
        const slot = net.rage.getSnapshot().slot
        net.rage.setSlot((slot + (event.code === 'ArrowRight' ? 1 : -1) + 5) % 5)
        return
      }
      if (event.key === 'Escape') {
        if (quickOpenRef.current) {
          setQuickOpen(false) // đang mở danh sách chat nhanh: Esc chỉ đóng danh sách
          return
        }
        if (document.activeElement === chatRef.current) {
          chatRef.current?.blur()
          return
        }
        if (performance.now() - chatClosedAtRef.current < 2000) return // vừa gửi chat, ô chat đã tự đóng: Esc chỉ là 'thoát ô chat', không rời hang
        if (rageOpenRef.current) {
          setRageOpen(false)
          return
        }
        if (document.pointerLockElement) {
          document.exitPointerLock()
          return
        }
        net.leave()
        onLeaveRef.current()
        return
      }
      if (typing()) return
      // Chat nhanh: phím 1–6 (hàng số hoặc bàn phím số) gửi thẳng câu có sẵn tương ứng
      const quick = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
      if (quick && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const text = QUICK_CHAT[Number(quick[1]) - 1]
        if (text) {
          event.preventDefault()
          net.sendChat(text)
          setQuickOpen(false)
          return
        }
      }
      if (event.code === 'KeyH') {
        setKeysOpen((open) => !open)
        return
      }
      if (event.code === 'Enter' && !event.repeat) {
        // Enter = nhắn tin trong hang (như bản gốc: "Nhấn Enter để nhắn tin")
        event.preventDefault()
        setChatHidden(false)
        window.setTimeout(() => chatRef.current?.focus(), 0)
        return
      }
      if (event.code === 'KeyE') {
        event.preventDefault()
        toggleSit()
        return
      }
      if (event.code === 'KeyF') {
        doPunch()
        return
      }
      if (event.code === 'KeyG') {
        if (!sittingRef.current) net.emote()
        return
      }
      if (event.code === 'KeyT') {
        setRageOpen((open) => !open)
        return
      }
      if (event.code === 'KeyV') {
        const target = net.nearest(INVITE_RANGE, true)
        if (target) net.ask('duel', target.actor.index)
        return
      }
      if (event.code === 'KeyB') {
        const target = net.nearest(INVITE_RANGE, true)
        if (target) net.ask('trap', target.actor.index)
        return
      }
      if (event.code === 'KeyR') {
        const target = net.nearest(INVITE_RANGE, true)
        if (target) net.ask('talk', target.actor.index)
        return
      }
      held.add(event.code)
    }
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.code)
    const releaseHeld = () => {
      if (held.size > 0) held.clear()
      joy.current.x = 0
      joy.current.y = 0
    }
    // Mất focus (chuyển tab/cửa sổ, hộp thoại hệ thống) thì sự kiện nhả phím không tới: không xả thì nhân vật cứ tự đi.
    const releaseAllInput = () => {
      held.clear()
      joy.current.x = 0
      joy.current.y = 0
      edge = 0
    }
    const onVisibility = () => {
      if (document.hidden) releaseAllInput()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAllInput)
    document.addEventListener('visibilitychange', onVisibility)

    const resize = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      // Màn hình dọc (điện thoại): góc nhìn dọc cố định 55° làm góc ngang chỉ còn ~27°, bảng treo giữa hang tràn cả bề ngang.
      // Nới góc nhìn theo độ hẹp của màn hình (tối đa 78°).
      camera.fov = viewFov(camera.aspect)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      tvRef.current?.resize(width, height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)

    let frame = 0
    let previous = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000)
      previous = now
      if (edge !== 0) yaw -= edge * 1.8 * dt
      const chatting = document.activeElement === chatRef.current
      const jx = Math.abs(joy.current.x) < DEAD_ZONE ? 0 : joy.current.x
      const jy = Math.abs(joy.current.y) < DEAD_ZONE ? 0 : joy.current.y
      const forward = chatting ? 0 : axis(held, 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown') + jy
      const strafe = chatting ? 0 : axis(held, 'KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft') + jx
      const wishX = Math.cos(yaw) * strafe - Math.sin(yaw) * forward
      const wishZ = -Math.sin(yaw) * strafe - Math.cos(yaw) * forward
      // Server không cho ngồi (ghế có người/quá xa) hoặc buộc đứng dậy (chat riêng, đấu võ): thoát trạng thái ngồi phía giao diện.
      if (sittingRef.current && !net.seated) {
        sittingRef.current = false
        seatRef.current = null
        setSitting(false)
        setHint('Không ngồi được ở ghế này.')
      }
      const frozen = sittingRef.current || net.getState().conv !== null || rageOpenRef.current
      // Cần điều khiển/phím bị gỡ khi bắt đầu chat riêng hoặc trận đấu thì sự kiện nhả không bao giờ tới: xả luôn để lúc quay lại không tự đi.
      if (frozen || net.gaming) releaseHeld()
      net.frame(dt, wishX, wishZ, frozen)

      for (const index of [...meshes.keys()]) if (!net.actors.has(index)) dropMesh(index)
      const here = net.local
      // Đặt camera trước để xếp hạng mức chi tiết theo khoảng cách tới camera.
      if (here) {
        const scale = viewDistanceScale(camera.aspect)
        // Ngẩng lên (pitch < 0): camera đứng yên ở độ cao thấp, điểm nhìn nâng lên theo để thấy màn hình treo trên cao.
        const lift = Math.max(0, -pitch)
        const pitchPos = Math.max(pitch, -0.08)
        const rig = { px: here.draw.x, py: here.draw.y, pz: here.draw.z, yaw, pitchPos, scale }
        // Camera không được ra ngoài vòm hang, cũng không được chui vào thân khán đài/bục/phòng chờ: lấy khoảng cách thoáng (liên tục) rồi lùi ra mượt.
        camDistance = easeDistance(camDistance, clearDistance(rig), dt)
        const distance = camDistance
        const spot = cameraSpot(rig, distance)
        const cx = spot.x
        const cz = spot.z
        const cy = Math.max(spot.y, solidTop(cx, cz) + CAMERA_CLEARANCE) // sát người chơi mà vẫn dưới mặt bậc phía sau: nâng lên chứ không để lọt xuống dưới
        camera.position.set(cx, cy, cz)
        camera.lookAt(here.draw.x, here.draw.y + CAMERA_LOOK_HEIGHT + lift * 18 * (distance / baseDistance(rig)), here.draw.z) // camera bị kéo sát người (gần khán đài) thì điểm nhìn nâng thấp theo, không thành nhìn thẳng lên trần
        if (localLunge > 0.01) camera.translateZ(-localLunge * 0.45) // ra đòn: camera xô nhẹ theo
        const shake = punchShake(performance.now() - net.punchedAt) // bị đấm: camera rung ngắn
        if (shake.x !== 0 || shake.y !== 0) {
          camera.translateX(shake.x)
          camera.translateY(shake.y)
        }
      } else {
        camera.position.set(0, 10, 50)
        camera.lookAt(0, 0, 0)
      }
      // Chế độ ném đồ: camera lướt sang đứng ngoài vòng, nhìn thẳng vào hình nộm đang chọn; nhân vật của mình được ẩn đi.
      if (rageOpenRef.current && here && !net.gaming) {
        const goal = ring.cameraFor(net.rage.getSnapshot().slot)
        rageGoalEye.set(goal.position.x, goal.position.y, goal.position.z)
        rageGoalLook.set(goal.look.x, goal.look.y, goal.look.z)
        if (!rageActive) {
          rageEye.copy(camera.position)
          rageLook.set(here.draw.x, here.draw.y + 1.45, here.draw.z)
          rageActive = true
        }
        const k = 1 - Math.exp(-dt * 5)
        rageEye.lerp(rageGoalEye, k)
        rageLook.lerp(rageGoalLook, k)
        camera.position.copy(rageEye)
        camera.lookAt(rageLook)
      } else rageActive = false
      // Khi ném đồ, camera đứng thấp ngoài vòng nhìn về giữa hang: mặt dưới bảng treo (khung đỏ) sẽ che cả nửa trên màn hình.
      hangingBoard.group.visible = !rageActive
      venue.crown.visible = !rageActive
      ring.group.visible = SHOW_FAKE_PEOPLE || rageActive // hình nộm (bia ném đồ) chỉ hiện khi đang ném đồ; ngoài ra là người giả trên bục nên tạm ẩn
      // Điện thoại: bảng ném đồ nằm dưới đáy nên đẩy hình nộm lên nửa trên màn hình (dịch khung nhìn, không dịch thế giới).
      // Dịch qua setViewOffset để tia ném (raycaster) và toạ độ chạm vẫn khớp với những gì đang thấy.
      const narrowRage = rageActive && el.clientWidth <= 800
      const viewKey = narrowRage ? `${el.clientWidth}x${el.clientHeight}` : ''
      if (viewKey !== appliedViewKey) {
        appliedViewKey = viewKey
        if (narrowRage) {
          const w = el.clientWidth
          const h = el.clientHeight
          const f = RAGE_VIEW_SHIFT
          camera.setViewOffset(w * (1 + 2 * f), h * (1 + 2 * f), w * f, h * 2 * f, w, h)
        } else camera.clearViewOffset()
      }
      camera.updateMatrixWorld()
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projScreen)

      const fullIds = new Set<number>()
      const visibleDistance = new Map<number, number>()
      if (here) {
        const candidates: Array<[number, number]> = []
        for (const a of net.actors.values()) {
          if (a.local) {
            fullIds.add(a.index)
            continue
          }
          sphere.center.set(a.draw.x, a.draw.y + 1, a.draw.z)
          sphere.radius = 1.6
          if (!frustum.intersectsSphere(sphere)) continue
          const far = sphere.center.distanceTo(camera.position)
          visibleDistance.set(a.index, far)
          const wasFull = meshes.get(a.index)?.actor.lod === 'full'
          if (far < (wasFull ? FULL_KEEP : FULL_TAKE)) candidates.push([far * (wasFull ? FULL_BIAS : 1), a.index])
        }
        candidates.sort((x, y) => x[0] - y[0])
        for (let i = 0; i < Math.min(MAX_FULL, candidates.length); i += 1) fullIds.add(candidates[i]![1])
      }
      lodStats.full = 0
      lodStats.liteVisible = 0
      lodStats.liteMaxPx = 0
      const halfTan = Math.tan((camera.fov * Math.PI) / 360)
      impact.update(now)
      venue.update(now)
      blobs.begin()
      for (const a of net.actors.values()) {
        const mesh = ensureMesh(a)
        const speed = Math.hypot(a.draw.vx, a.draw.vz)
        mesh.actor.group.position.set(a.draw.x, a.draw.y, a.draw.z)
        mesh.actor.group.rotation.y = a.draw.heading
        if (a.local) mesh.actor.group.visible = !rageActive
        const want = fullIds.has(a.index) || !here ? 'full' : 'lite'
        setFootballerLod(mesh.actor, want)
        // ngồi ghế/sofa/khán đài thì cất xe lăn (người ngồi hẳn lên ghế); ở xa (mức 'lite') cũng không vẽ xe
        const benchSeated = a.local ? sittingRef.current : net.seats.has(a.index)
        if (mesh.actor.ride) mesh.actor.ride.group.visible = want === 'full' && !benchSeated
        if (want === 'full') lodStats.full += 1
        else {
          const d = visibleDistance.get(a.index)
          if (d !== undefined) {
            lodStats.liteVisible += 1
            lodStats.liteMaxPx = Math.max(lodStats.liteMaxPx, (LITE_HEIGHT * (el.clientHeight / 2)) / (halfTan * d))
          }
        }
        if (want === 'full') {
          const step = mesh.lastAt > 0 ? Math.min(0.1, (now - mesh.lastAt) / 1000) : dt
          mesh.lastAt = now
          let turn = a.draw.heading - mesh.lastHeading
          turn = Math.atan2(Math.sin(turn), Math.cos(turn))
          const turnRate = step > 1e-4 ? turn / step : 0
          const accel = step > 1e-4 ? (speed - mesh.lastSpeed) / step : 0
          mesh.lastHeading = a.draw.heading
          mesh.lastSpeed = speed
          // Đối tượng của cú đấm đang diễn ra (để xoay thân về phía họ): chỉ số người, −1 = hụt/không rõ.
          let punchAt = -1
          const reactTo = (by: number) => {
            const from = net.actors.get(by)
            const dir = from ? hitDirection({ x: a.draw.x, z: a.draw.z, heading: a.draw.heading }, { x: from.draw.x, z: from.draw.z }) : { front: 1, side: 0 }
            mesh.gait.hit(dir.front, dir.side)
            // tia sáng tại ngực người bị đấm, hơi lệch về phía người đấm
            const ux = from ? from.draw.x - a.draw.x : 0
            const uz = from ? from.draw.z - a.draw.z : 0
            const ul = Math.hypot(ux, uz) || 1
            impact.spawn('hit', a.draw.x + (ux / ul) * 0.35, a.draw.y + 1.3, a.draw.z + (uz / ul) * 0.35, now)
          }
          if (a.local) {
            if (net.punchAnimAt !== mesh.seenPunch) {
              mesh.seenPunch = net.punchAnimAt
              mesh.gait.punch(net.punchTargetIndex >= 0 ? 'hit' : 'miss')
              if (net.punchTargetIndex < 0) impact.spawn('miss', a.draw.x + Math.sin(a.draw.heading) * 1.1, a.draw.y + 1.25, a.draw.z + Math.cos(a.draw.heading) * 1.1, now, 0.1)
            }
            if (net.punchedAt !== mesh.seenHurt) {
              mesh.seenHurt = net.punchedAt
              reactTo(net.punchedBy)
            }
            punchAt = net.punchTargetIndex
          } else {
            const swing = net.swings.get(a.index)
            if (swing && swing.at !== mesh.seenSwing) {
              mesh.seenSwing = swing.at
              mesh.gait.punch(swing.target >= 0 ? 'hit' : 'miss')
              if (swing.target < 0) impact.spawn('miss', a.draw.x + Math.sin(a.draw.heading) * 1.1, a.draw.y + 1.25, a.draw.z + Math.cos(a.draw.heading) * 1.1, now, 0.1)
            }
            const hurt = net.hurts.get(a.index)
            if (hurt && hurt.at !== mesh.seenHurtRemote) {
              mesh.seenHurtRemote = hurt.at
              reactTo(hurt.by)
            }
            punchAt = swing?.target ?? -1
          }
          // Khi ra đòn trúng: thân xoay (tối đa ~40°) về phía mục tiêu; đòn hụt giữ nguyên hướng (vung vào khoảng không).
          const aimed = punchAt >= 0 && mesh.gait.isPunching ? net.actors.get(punchAt) : undefined
          const wantBias = aimed ? turnToward({ x: a.draw.x, z: a.draw.z }, a.draw.heading, { x: aimed.draw.x, z: aimed.draw.z }, 0.7) : 0
          mesh.yawBias += (wantBias - mesh.yawBias) * (1 - Math.exp(-step * 14))
          mesh.actor.group.rotation.y = a.draw.heading + mesh.yawBias
          const emoted = net.emotedAt.get(a.index) ?? -Infinity
          if (emoted !== mesh.seenEmote) {
            mesh.seenEmote = emoted
            if (!mesh.gait.isCelebrating) confetti.burst(a.draw.x, a.draw.y, a.draw.z, teamColors(a.look)) // phát bắn pháo giấy lúc bắt đầu
            mesh.gait.celebrate()
          }
          // mưa pháo giấy quanh người suốt lúc ăn mừng
          if (mesh.gait.isCelebrating) confetti.shower(a.index, a.draw.x, a.draw.y, a.draw.z, mesh.gait.celebrateTime, step, teamColors(a.look))
          const riding = mesh.actor.ride !== null
          mesh.gait.setSeated(benchSeated || riding) // ngồi xe lăn: luôn ở tư thế ngồi, chân không bước
          const pose = mesh.gait.update(step, { speed, turnRate, accel })
          applyBodyPose(mesh.actor, pose)
          // xe lăn: ngồi thấp trong xe, tay bám vành đẩy theo nhịp, bánh lăn vi sai khi rẽ; ăn mừng thì bốc đầu xe và nhảy (xem wheelchair.ts); tay đang đấm thì để nguyên
          if (riding && !benchSeated) animateRide(mesh.actor, mesh.ride, step, { speed, turnRate, accel, celebrate: mesh.gait.celebrateTime }, pose, [!mesh.gait.isPunching, true])
          else if (riding) settleRide(mesh.actor.ride)
          // xô tới khi ra đòn / bị hất khi trúng đòn: dịch cả người dọc hướng mặt (chỉ hiển thị)
          const shove = mesh.gait.lunge + mesh.gait.knock
          if (shove !== 0) {
            mesh.actor.group.position.x += Math.sin(a.draw.heading) * shove
            mesh.actor.group.position.z += Math.cos(a.draw.heading) * shove
          }
          if (a.local) localLunge = mesh.gait.lunge
          if (a.local) {
            const hs = animStats
            hs.frames += 1
            if (hs.prev) for (const k of ['rArm', 'lArm', 'rLeg', 'lLeg', 'rKnee', 'lKnee', 'rElbow', 'lElbow', 'headPitch', 'headYaw'] as const) hs.maxJump = Math.max(hs.maxJump, Math.abs(pose[k] - hs.prev[k]) / Math.min(step, 0.05))
            hs.prev = pose
          }
        }
        setBubble(a.index, mesh, net.bubbles.get(a.index)?.text ?? '')
      }

      for (const a of net.actors.values()) if (!(a.local && rageActive)) blobs.add(a.draw.x, a.draw.y, a.draw.z)
      blobs.end()
      confetti.update(dt)
      ring.update(now, dt)
      // Đang có trận: vẽ sàn đấu 3D thay cho cảnh hang (cảnh hang vẫn cập nhật ngầm để vị trí không lệch khi quay lại).
      const duelView = net.duel.getSnapshot()
      if (duelView.phase !== 'idle') {
        if (!arena) {
          arena = createArena()
          arenaKey = ''
        }
        const key = `${duelView.peer}:${Math.round(duelView.goAt)}`
        if (key !== arenaKey) {
          arenaKey = key
          arena.setFighters(
            { name: duelView.myName, number: numberRef.current, look: net.local?.look },
            { name: duelView.peerName, number: net.actors.get(duelView.peer)?.number ?? null, look: net.actors.get(duelView.peer)?.look },
          )
        }
        arena.update(duelView, now, dt, el.clientWidth / Math.max(1, el.clientHeight))
        if (!liteRender || now - lastRenderAt >= 60) {
          lastRenderAt = now
          renderer.render(arena.scene, arena.camera)
          tv.render(camera, false)
        }
      } else {
        if (arena) {
          arena.dispose()
          arena = null
        }
        if (!liteRender || now - lastRenderAt >= 60) {
          lastRenderAt = now
          renderer.render(scene, camera)
          tv.render(camera, true)
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    const hintTimer = window.setInterval(() => {
      const me = net.local
      if (!me || sittingRef.current) return
      const human = net.nearest(INVITE_RANGE, true)
      setNear((current) => {
        const next = human ? { index: human.actor.index, name: human.actor.name, bot: false } : null
        return current?.index === next?.index ? current : next
      })
      const target = net.punchTarget()
      const others = [...net.actors.values()].filter((a) => !a.local).map((a) => ({ x: a.curr.x, z: a.curr.z }))
      const zone = zoneAt({ x: me.curr.x, z: me.curr.z }, others)
      setSeatNear(zone !== null && (zone.kind === 'gate' || 'seat' in zone))
      if (target) setHint(`${target.name} đang đứng gần. Bấm ${touch ? '👊' : 'F'} để đấm.`)
      else if (zone) setHint(zonePrompt(zone, touch))
      else setHint(touch ? TOUCH_HINT : IDLE_HINT)
    }, 400)

    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(hintTimer)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAllInput)
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('pointerup', onPointerEnd)
      el.removeEventListener('pointercancel', onPointerEnd)
      if (document.pointerLockElement) document.exitPointerLock()
      arena?.dispose()
      tv.dispose()
      blobs.dispose()
      tvRef.current = null
      impact.dispose()
      confetti.dispose()
      stopRageLabels()
      stopRageThrow()
      ring.dispose()
      for (const index of [...meshes.keys()]) dropMesh(index)
      disposeFootballerKit()
      for (const item of trash) item.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [net, touch])

  // Gửi xong (hoặc Enter khi ô trống) thì rời ô chat, trả phím cho nhân vật: trước đây gửi xong vẫn kẹt trong ô chat.
  // Tin bị chặn (gửi quá nhanh...) thì giữ ô chat để gửi lại.
  const send = (event: FormEvent) => {
    event.preventDefault()
    if (draft.trim().length === 0) {
      chatClosedAtRef.current = performance.now()
      chatRef.current?.blur()
      return
    }
    if (net.sendChat(draft)) {
      setDraft('')
      chatClosedAtRef.current = performance.now()
      chatRef.current?.blur()
    }
  }

  const leave = () => {
    net.leave()
    onLeave()
  }
  const me = net.local

  const talkLines = state.chat.filter((line) => !line.activity).slice(-8)
  const activityLines = state.chat.filter((line) => line.activity).slice(-4)
  const chatPanel = (
    <section className="hang-chat" aria-label="Chat trong hang">
      {!touch ? (
        <header className="hang-chat-head">
          <strong>Chat trong hang</strong>
          <button type="button" className="hang-chat-hide" onClick={() => setChatHidden(true)}>Ẩn</button>
        </header>
      ) : null}
      <ul>
        {talkLines.map((line) => (
          <li key={line.id} data-state={line.state} data-system={line.system || undefined}>
            <strong>{line.name}</strong> {line.text}
            {line.state === 'failed' ? ' (chưa gửi được)' : ''}
          </li>
        ))}
      </ul>
      {activityLines.length > 0 ? (
        <>
          <p className="hang-activity-title">Hoạt động</p>
          <ul className="hang-activity">
            {activityLines.map((line) => (
              <li key={line.id} data-activity>
                <strong>{line.name}</strong> {line.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {quickOpen ? (
        <div className="hang-quick" role="menu" aria-label="Chat nhanh">
          {QUICK_CHAT.map((text) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              className="hang-quick-item"
              onClick={() => {
                net.sendChat(text)
                setQuickOpen(false)
              }}
            >
              <kbd className="hang-quick-key">{QUICK_CHAT.indexOf(text) + 1}</kbd> {text}
            </button>
          ))}
        </div>
      ) : null}
      <form onSubmit={send}>
        <button
          type="button"
          className="carved-btn carved-btn--ghost hang-quick-btn"
          aria-label="Chat nhanh"
          aria-expanded={quickOpen}
          title="Chat nhanh: chọn câu có sẵn (phím 1–6)"
          onClick={() => setQuickOpen((open) => !open)}
        >
          ⚡
        </button>
        <input
          ref={chatRef}
          value={draft}
          maxLength={CHAT_MAX_CHARS}
          placeholder={touch ? 'Chào anh em một câu' : 'Nhấn Enter để nhắn tin…'}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setChatFocused(true)}
          onBlur={() => setChatFocused(false)}
        />
        <button type="submit" className="carved-btn carved-btn--primary">
          Gửi
        </button>
      </form>
      {chatFocused && !touch ? (
        <p className="hang-chat-tip">
          <kbd>Enter</kbd> gửi · <kbd>Esc</kbd> thoát ô chat để di chuyển
        </p>
      ) : null}
    </section>
  )

  return (
    <main className="hang" ref={mainRef} data-touch={touch || undefined}>
      <h1 className="visually-hidden">Trong hang</h1>
      <div className="hang-scene" ref={host} />
      <header className="hang-top" ref={headerRef}>
        <div className="hang-top-left">
          <button type="button" className="carved-btn carved-btn--ghost hang-leave hang-exit" onClick={leave}>
            Ra hang
          </button>
          <div className="hang-vol">
            <button
              type="button"
              className="carved-btn carved-btn--ghost hang-sound"
              aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
              aria-pressed={muted}
              onClick={() => audio.toggleMuted()}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              className="hang-vol-range"
              aria-label="Âm lượng"
              min={0}
              max={100}
              step={1}
              value={muted ? 0 : volume}
              onChange={(event) => audio.setVolume(Number(event.target.value))}
            />
          </div>
          <button type="button" className="carved-btn carved-btn--ghost hang-volume-btn" aria-label="Âm lượng (mở bảng)" aria-expanded={volumeOpen} onClick={() => setVolumeOpen((open) => !open)}>
            ▾
          </button>
          <a className="hang-tele" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Group Telegram HangMu (mở tab mới)">
            ✈<span className="hang-btn-label"> Group Tele</span>
          </a>
          <button type="button" className="carved-btn carved-btn--ghost hang-leave hang-rank-btn" aria-label="Võ công cao nhất hang" aria-pressed={rankOpen} onClick={() => setRankOpen((open) => !open)}>
            🥋<span className="hang-btn-label"> Võ công</span>
          </button>
          <button type="button" className="carved-btn carved-btn--ghost hang-leave hang-tv-btn" aria-label="Màn hình lớn (xem video)" aria-pressed={tvOpen} onClick={() => setTvOpen((open) => !open)}>
            📺<span className="hang-btn-label"> Màn hình lớn</span>
          </button>
          <button type="button" className="carved-btn carved-btn--ghost hang-leave" aria-label="Ném đồ" onClick={() => setRageOpen((open) => !open)}>
            🍅<span className="hang-btn-label"> Ném đồ <span className="kbd-hint">(T)</span></span>
          </button>
          <button type="button" className="carved-btn carved-btn--ghost hang-leave hang-outfit-btn" aria-label="Đổi trang phục" title="Đổi trang phục" onClick={() => setOutfitOpen(true)} disabled={state.phase !== 'inCave' || gameOn}>
            👕<span className="hang-btn-label"> Áo</span>
          </button>
        </div>
        <p className="hang-count">
          <strong>Hang chung</strong>
          {state.phase === 'inCave' && state.inRoom ? (
            <span>
              <span className="hang-count-icon" aria-hidden="true">👥 </span>
              {net.actors.size || state.inRoom}
              <span className="hang-count-label"> anh em trong hang</span>
            </span>
          ) : (
            <span>Đang vào hang…</span>
          )}
        </p>
      </header>
      <ConnectionBanner state={state} />
      {debug ? <DebugHud net={net} /> : null}
      {gameOn ? null : <InviteBar net={net} state={state} />}
      <PunchFlash state={state} />
      {tvOpen && !gameOn ? (
        <TvPanel
          serverVideos={state.boardVideos}
          playing={tvPlaying}
          onPlay={(ids) => {
            const ok = tvRef.current?.play(ids) ?? false
            setTvPlaying(ok)
            return ok
          }}
          onStop={() => {
            tvRef.current?.stop()
            setTvPlaying(false)
          }}
          onCommand={(name) => tvRef.current?.command(name)}
          onClose={() => setTvOpen(false)}
        />
      ) : null}
      {rageOpen && !gameOn ? <RagePanel net={net} onClose={() => setRageOpen(false)} /> : null}
      <DuelOverlay net={net} />
      <TrapOverlay net={net} />
      {gameOn ? null : <BoardPanel key={sitting ? 'seated' : 'standing'} state={state} sitting={sitting} />}
      {gameOn ? null : <TalkPanel net={net} state={state} />}
      {dueling ? null : <NoticeToast /> /* Bẫy Độc: vẫn hiện thông báo (nổi trên bàn chơi), để thấy kết quả toàn hang */}
      {gameOn ? null : (
        <div className="hang-right">
          {volumeOpen ? <VolumePanel onClose={() => setVolumeOpen(false)} /> : null}
          <LckWidget />
          {rankOpen ? <RankPanel net={net} onClose={() => setRankOpen(false)} /> : null}
          <PollCard net={net} state={state} />
          {!touch ? (chatHidden ? <button type="button" className="carved-btn carved-btn--ghost hang-chat-show" onClick={() => setChatHidden(false)}>💬 Chat</button> : chatPanel) : null}
        </div>
      )}
      {!touch && !gameOn ? <WeeklyBoard net={net} myName={identity.name} /> : null}
      <div className="hang-corner">
        <Donate open={donateOpen} onToggle={() => setDonateOpen((open) => !open)} className="hang-donate" />
        <button type="button" className="hang-corner-btn" aria-label="Thông tin, bản quyền và điều khoản" onClick={() => setLegalOpen(true)}>©</button>
        <button type="button" className="hang-corner-btn hang-keys-btn" aria-expanded={keysOpen} onClick={() => setKeysOpen((open) => !open)}>
          Phím <span className="kbd-hint">(H)</span>
        </button>
      </div>
      {!touch && !gameOn && !state.conv && state.phase === 'inCave' ? (
        <button type="button" className="hang-emote" disabled={sitting} onClick={() => net.emote()}>
          🎉 Ăn mừng <kbd>G</kbd>
        </button>
      ) : null}
      {keysOpen ? <KeyHelp onClose={() => setKeysOpen(false)} /> : null}
      {legalOpen ? <LegalDialog onClose={() => setLegalOpen(false)} /> : null}
      {outfitOpen ? (
        <CharacterDialog
          mode="outfit"
          initial={identity}
          onClose={() => setOutfitOpen(false)}
          onSave={(next) => {
            setOutfitOpen(false)
            if (next.look === identity.look) return
            net.changeLook(next.look)
            onOutfit?.(next)
          }}
        />
      ) : null}
      {gameOn ? null : (
      <div className="hang-dock">
        {state.notice ? <p className="hang-notice">{state.notice}</p> : null}
      <p className="hang-hint" data-action={state.phase === 'inCave' && isActionHint(hint) ? '' : undefined}>{state.phase === 'inCave' ? renderHint(hint) : 'Đang chờ hang mở cửa…'}</p>
      {near && !gameOn && !state.conv && !state.asking && !state.invite && state.phase === 'inCave' && me ? (
        <div className="hang-talk-btn">
          <button type="button" className="carved-btn carved-btn--primary" onClick={() => net.ask('talk', near.index)}>
            💬 Giao lưu mồm với {near.name} <span className="kbd-hint">(R)</span>
          </button>
          <button type="button" className="carved-btn carved-btn--primary" onClick={() => net.ask('duel', near.index)}>
            🥊 Giao lưu võ thuật <span className="kbd-hint">(V)</span>
          </button>
          <button type="button" className="carved-btn carved-btn--primary hang-trap-btn" onClick={() => net.ask('trap', near.index)}>
            🍄 Bẫy Độc Noxus <span className="kbd-hint">(B)</span>
          </button>
        </div>
      ) : null}
      {touch && !chatOpen ? null : touch ? chatPanel : null}
      </div>
      )}
      {touch && !gameOn && !state.conv && !rageOpen && state.phase === 'inCave' ? (
        <TouchControls
          onMove={(x, y) => {
            joy.current.x = x
            joy.current.y = y
          }}
          sitting={sitting}
          canSit={seatNear}
          chatOpen={chatOpen}
          onPunch={() => actions.current.punch()}
          onSit={() => actions.current.sit()}
          onEmote={() => net.emote()}
          onToggleChat={() => setChatOpen((open) => !open)}
        />
      ) : null}
      <StatusOverlay
        state={state}
        onRetry={() => net.connect(identity.name, identity.number, identity.look)}
        onLeave={leave}
      />
    </main>
  )
}

function axis(held: Set<string>, positiveA: string, positiveB: string, negativeA: string, negativeB: string): number {
  const positive = held.has(positiveA) || held.has(positiveB) ? 1 : 0
  const negative = held.has(negativeA) || held.has(negativeB) ? 1 : 0
  return positive - negative
}
