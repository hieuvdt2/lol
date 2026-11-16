import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Gait } from '../game/gait.ts'
import { decodeLook } from '../../shared/look.mjs'
import { applyBodyPose, makeFootballer, releaseFootballer, setFootballerLod } from '../game/person.ts'
import { animateRide, newRideState } from '../game/wheelchair.ts'
import { createConfetti } from '../game/confetti.ts'
import type { Footballer } from '../game/person.ts'

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Chế độ nhẹ (localStorage `hangmu.lite` = '1') hoặc người dùng tắt chuyển động: chỉ vẽ lại khi đổi lựa chọn, không xoay liên tục. */
function staticPreview(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('hangmu.lite') === '1') return true
  } catch {
    /* bỏ qua */
  }
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface Props {
  name: string
  look: number
  /** Tăng lên mỗi lần bấm "Ăn mừng" để nhân vật làm động tác. */
  cheer: number
}

/**
 * Xem trước nhân vật 3D trong hộp thoại tạo nhân vật: tự xoay chậm, kéo để xoay, đổi lựa chọn thấy ngay.
 * Dùng chung geometry/vật liệu với nhân vật trong hang (person.ts) nên trông giống hệt. Không có WebGL thì ẩn đi (hộp thoại vẫn dùng được).
 */
export function CharacterPreview({ name, look, cheer }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ setFigure(name: string, look: number): void; cheer(): void } | null>(null)
  const [supported] = useState(webglAvailable)

  useEffect(() => {
    const el = host.current
    if (!el || !supported) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false })
    } catch {
      return // không tạo được ngữ cảnh WebGL: khung xem trước để trống, hộp thoại vẫn dùng được
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.className = 'char-preview-canvas'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#26305a', 2.2))
    const key = new THREE.DirectionalLight('#ffffff', 1.6)
    key.position.set(2, 4, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#3fc8ff', 1.2)
    rim.position.set(-3, 2, -4)
    scene.add(rim)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1b2a52' }))
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.92, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fc8ff' }))
    ring.position.y = 0.002
    scene.add(disc, ring)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30)
    camera.position.set(0, 1.4, 5.4)
    camera.lookAt(0, 1.05, 0)

    let figure: Footballer | null = null
    const turntable = new THREE.Group()
    scene.add(turntable)
    const gait = new Gait(0)
    const rideState = newRideState()
    const confetti = createConfetti(scene, 300)
    let yaw = 0.5
    let dragging: { x: number; yaw: number } | null = null
    const still = staticPreview()
    let last = performance.now()
    let frame = 0
    let dirty = true

    const resize = () => {
      const w = Math.max(1, el.clientWidth)
      const h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      dirty = true
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(el)
    resize()

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!still && !dragging) yaw += dt * 0.6
      turntable.rotation.y = yaw
      if (figure) {
        const pose = gait.update(dt, { speed: 0, turnRate: 0, accel: 0 })
        applyBodyPose(figure, pose)
        // xe lăn: ngồi trong xe, hai tay đặt trên vành đẩy; ăn mừng thì bốc đầu xe và nhảy
        if (figure.ride) animateRide(figure, rideState, dt, { speed: 0, turnRate: 0, accel: 0, celebrate: gait.celebrateTime }, pose)
        if (gait.isCelebrating) confetti.shower(0, 0, 0, 0, gait.celebrateTime, dt)
      }
      confetti.update(dt)
      renderer.render(scene, camera)
      dirty = false
    }
    const loop = (now: number) => {
      // chế độ tĩnh: chỉ vẽ khi có thay đổi hoặc đang ăn mừng / đang kéo
      if (!still || dirty || dragging || gait.isCelebrating) draw(now)
      else last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    const onDown = (event: PointerEvent) => {
      dragging = { x: event.clientX, yaw }
      renderer.domElement.setPointerCapture?.(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      yaw = dragging.yaw + (event.clientX - dragging.x) * 0.012
      dirty = true
    }
    const onUp = () => {
      dragging = null
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointercancel', onUp)

    api.current = {
      setFigure(nextName, nextLook) {
        if (figure) {
          turntable.remove(figure.group)
          releaseFootballer(figure)
        }
        figure = makeFootballer(nextName.trim() || 'Bạn', null, nextLook)
        setFootballerLod(figure, 'full')
        gait.setSeated(decodeLook(nextLook).ride === 1) // ngồi xe lăn
        turntable.add(figure.group)
        dirty = true
      },
      cheer() {
        if (!gait.isCelebrating) confetti.burst(0, 0, 0)
        gait.celebrate()
        dirty = true
      },
    }

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      api.current = null
      confetti.dispose()
      if (figure) releaseFootballer(figure) // geometry/vật liệu của nhân vật là đồ dùng chung (person.ts): không giải phóng ở đây
      disc.geometry.dispose()
      ;(disc.material as THREE.Material).dispose()
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [supported])

  useEffect(() => {
    api.current?.setFigure(name, look)
  }, [name, look])

  useEffect(() => {
    if (cheer > 0) api.current?.cheer()
  }, [cheer])

  if (!supported) return null
  return <div ref={host} className="char-preview" role="img" aria-label="Xem trước nhân vật (kéo để xoay)" />
}
