import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { bannerTexture } from '../game/caveMesh.ts'
import { domeTexture } from '../game/arenaTextures.ts'

interface CaveProps {
  onReady: () => void
}

export function Cave({ onReady }: CaveProps) {
  const host = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    // Cổng vào đấu trường (ban ngày): sàn trắng, trụ thép xám sáng, viền đỏ dịu. Chủ đề fan T1 (đỏ-đen-trắng).
    scene.background = new THREE.Color('#b9c3d3')
    scene.fog = new THREE.Fog('#b9c3d3', 10, 26)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40)
    camera.position.set(0.15, 2.1, 12.8)
    camera.lookAt(0.1, 1.7, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#ffffff', '#8f97aa', 1.5))
    const sun = new THREE.DirectionalLight('#fff3dc', 1.4)
    sun.position.set(-5, 8, 6)
    scene.add(sun)
    const ember = new THREE.PointLight('#ff8c98', 10, 9, 2)
    ember.position.set(0.1, 1.35, -1.3)
    scene.add(ember)

    const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = []
    const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(item: T): T => {
      disposables.push(item)
      return item
    }
    const white = own(new THREE.MeshLambertMaterial({ color: '#eef0f6' }))
    const steel = own(new THREE.MeshLambertMaterial({ color: '#9aa3b5' }))
    const dark = own(new THREE.MeshLambertMaterial({ color: '#2c303c' }))
    const redSolid = own(new THREE.MeshLambertMaterial({ color: '#d93a4a' }))
    const redGlow = own(new THREE.MeshBasicMaterial({ color: '#e5455a' }))
    const light = own(new THREE.MeshBasicMaterial({ color: '#fff1d8' }))
    const bannerMap = own(bannerTexture())
    const banner = own(new THREE.MeshBasicMaterial({ map: bannerMap }))
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const geometry = own(new THREE.BoxGeometry(w, h, d))
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      scene.add(mesh)
      return mesh
    }

    // sàn lát lục giác sáng (cùng mô-típ với sàn trong hang)
    const floorMap = own(domeTexture(30, 30))
    const ground = new THREE.Mesh(own(new THREE.CircleGeometry(22, 48)), own(new THREE.MeshLambertMaterial({ map: floorMap })))
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // cổng vào đấu trường: hai trụ trắng viền đỏ, thanh ngang phía trên, ô cửa sáng nhìn thấy ánh đèn sân đấu bên trong
    for (const side of [-1, 1]) {
      box(1.5, 3.3, 1.5, white, side * 2.15, 1.65, -1.3)
      box(0.14, 3.3, 0.06, redGlow, side * 2.15 + side * 0.4, 1.65, -0.53)
      box(0.14, 3.3, 0.06, redGlow, side * 2.15 - side * 0.4, 1.65, -0.53)
    }
    box(5.9, 0.7, 1.5, dark, 0, 3.65, -1.3)
    box(5.9, 0.1, 0.06, redGlow, 0, 3.32, -0.53)
    box(2.8, 3.3, 0.1, light, 0, 1.65, -2.1)
    for (const x of [-0.9, 0, 0.9]) box(0.12, 3.3, 0.04, redGlow, x, 1.65, -2.02)
    box(2.2, 0.35, 0.5, steel, 0, 0.18, -1.9) // bục nhỏ trong ô cửa

    // khán đài hai bên: các bậc xếp dần lên, xen đỏ - trắng - than chì
    const stand = [white, redSolid, dark, white]
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        box(1.7, 0.45 + i * 0.5, 7, stand[(i + (side > 0 ? 1 : 0)) % stand.length]!, side * (3.6 + i * 1.5), (0.45 + i * 0.5) / 2, -2.2 - i * 0.2)
      }
    }
    box(34, 9, 0.5, own(new THREE.MeshLambertMaterial({ color: '#c6ccd8' })), 0, 4.5, -9)
    // đường chân trời: các khối mái nhà thi đấu xa xa và hai cột đèn pha
    const skyline = own(new THREE.MeshLambertMaterial({ color: '#b4bccb' }))
    for (const [x, w, h] of [[-12, 4, 5], [-8, 3, 7], [8, 3.5, 6.5], [12, 4.5, 4.5], [-15, 3, 3.5], [15, 3, 3.5]] as const) box(w, h, 2, skyline, x, h / 2, -8.2)
    for (const side of [-1, 1]) {
      box(0.22, 8, 0.22, dark, side * 7.4, 4, -3.4)
      box(1.9, 1, 0.3, light, side * 7.4, 8.3, -3.2)
      box(1.9, 0.12, 0.34, redGlow, side * 7.4, 7.72, -3.2)
    }

    // lối đi: ô lát sáng xen đỏ
    const tile = own(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 6))
    for (let index = 0; index < 6; index += 1) {
      const mesh = new THREE.Mesh(tile, index % 3 === 1 ? redSolid : white)
      mesh.position.set(-0.2 + index * 0.06, 0.03, 3.5 - index * 0.72)
      mesh.rotation.y = index * 0.4
      scene.add(mesh)
    }
    // cột chắn dọc lối đi
    const post = own(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10))
    const cap = own(new THREE.SphereGeometry(0.13, 10, 8))
    for (const [x, z] of [[-1.5, 3.8], [1.5, 3.8], [-1.5, 1.4], [1.5, 1.4]] as const) {
      const stem = new THREE.Mesh(post, white)
      stem.position.set(x, 0.35, z)
      const top = new THREE.Mesh(cap, redGlow)
      top.position.set(x, 0.74, z)
      scene.add(stem, top)
    }

    // cờ hiệu bên phải
    const bar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8)), dark)
    bar.rotation.z = Math.PI / 2
    bar.position.set(3.1, 2.62, 1.55)
    scene.add(bar)
    box(0.62, 1.4, 0.06, banner, 3.1, 1.85, 1.55)

    const resize = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)

    // Chế độ nhẹ (localStorage `hangmu.lite` = '1'): sảnh chỉ vẽ ≤ ~16 khung/giây (xem Hang.tsx).
    const lite = (() => {
      try {
        return localStorage.getItem('hangmu.lite') === '1'
      } catch {
        return false
      }
    })()
    let lastDraw = -Infinity
    let frame = 0
    let frames = 0
    let stamp = performance.now()
    let elapsed = 0
    let started = false

    const loop = (now: number) => {
      if (!started) {
        started = true
        onReadyRef.current()
      }
      const delta = now - stamp
      stamp = now
      elapsed += delta
      frames += 1
      if (elapsed >= 400) {
        setFps(Math.round((frames * 1000) / elapsed))
        frames = 0
        elapsed = 0
      }
      if (!lite || now - lastDraw >= 60) {
        lastDraw = now
        renderer.render(scene, camera)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const item of disposables) item.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  const level = fps === null ? 'ok' : fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad'

  return (
    <div className="home-scene" ref={host}>
      <p className="fps-badge" data-level={level}>
        {fps === null ? '… FPS' : `${fps} FPS`}
      </p>
    </div>
  )
}
