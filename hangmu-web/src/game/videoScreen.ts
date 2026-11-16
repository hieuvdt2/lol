// Màn hình lớn nhúng video YouTube đặt trong cảnh 3D.
//
// Cách làm: trình phát là iframe thật trong một lớp CSS3D nằm DƯỚI canvas WebGL; mặt phẳng màn hình trong cảnh 3D được vẽ bằng
// "vật liệu đục lỗ" (alpha 0, không trộn) nên chỗ nào màn hình không bị vật khác che thì thấy iframe xuyên qua, chỗ bị người/cột che
// thì che đúng như vật thật. Khi chưa phát, màn hình chỉ là tấm áp phích tự vẽ — không có yêu cầu mạng nào tới bên thứ ba.
// Nội dung bên thứ ba chỉ được tải SAU khi người dùng bấm phát (tôn trọng quyền riêng tư, như màn hình hội trường).
import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { embedUrl } from './board.ts'

/**
 * Vị trí màn hình: giữ chỗ màn hình hội trường (vách phía bắc, trên bệ sân khấu, đối diện dãy ghế hội trường) như màn hình hội trường của bản gốc.
 * Góc quanh trục hang (0 = +z, π/2 = +x), khoảng cách tới trục, độ cao tâm và kích thước (16:9). Mép dưới nằm sát đỉnh bệ (cao 3,6 m).
 */
export const VIDEO_SCREEN = { angle: Math.PI, distance: 45.8, centerY: 10.2, width: 21, height: 11.8125 } as const

const YT_ORIGIN = 'https://www.youtube-nocookie.com'
const FRAME_W = 1280
const FRAME_H = 720

export type TvCommand = 'play' | 'pause' | 'next' | 'mute' | 'unmute'

export interface VideoScreen {
  /** Bắt đầu phát danh sách ID (tạo iframe). Danh sách rỗng thì không làm gì và trả false. */
  play(ids: readonly string[]): boolean
  stop(): void
  command(name: TvCommand): void
  readonly playing: boolean
  /** Gọi mỗi khung hình sau khi vẽ cảnh WebGL. `visible` false (đang đấu võ...) thì ẩn lớp CSS. */
  render(camera: THREE.Camera, visible: boolean): void
  resize(width: number, height: number): void
  dispose(): void
}

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

function posterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const g = canvas.getContext('2d')
  if (g) {
    const bg = g.createLinearGradient(0, 0, 1280, 720)
    bg.addColorStop(0, '#20242f')
    bg.addColorStop(1, '#3a1d27')
    g.fillStyle = bg
    g.fillRect(0, 0, 1280, 720)
    // họa tiết lục giác mờ
    g.strokeStyle = 'rgba(255,255,255,0.07)'
    g.lineWidth = 3
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 14; col += 1) {
        const cx = col * 104 + (row % 2 ? 52 : 0)
        const cy = row * 90
        g.beginPath()
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6
          g.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60)
        }
        g.closePath()
        g.stroke()
      }
    }
    g.fillStyle = '#d93a4a'
    g.beginPath()
    g.arc(640, 300, 120, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(600, 235)
    g.lineTo(600, 365)
    g.lineTo(712, 300)
    g.closePath()
    g.fill()
    g.textAlign = 'center'
    g.font = '800 64px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillText('MÀN HÌNH LỚN', 640, 520)
    g.font = '600 34px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#ffb3bb'
    g.fillText('Ngồi ghế hội trường, bấm 📺 trên thanh trên cùng để xem', 640, 585)
    g.font = '500 26px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#c8ceda'
    g.fillText('Video do YouTube phát, chỉ tải khi bạn bấm', 640, 635)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createVideoScreen(scene: THREE.Scene, host: HTMLElement, trash: Trash): VideoScreen {
  const { angle, distance, centerY, width, height } = VIDEO_SCREEN
  const group = new THREE.Group()
  group.position.set(Math.sin(angle) * distance, centerY, Math.cos(angle) * distance)
  group.rotation.y = angle + Math.PI // mặt hướng về tâm hang
  scene.add(group)

  // khung và chân đỡ
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#2c303c', roughness: 0.4, metalness: 0.6 })
  const accent = new THREE.MeshBasicMaterial({ color: '#d93a4a' })
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, height + 1.2, 0.5), frameMaterial)
  bezel.position.z = -0.3
  const stripeTop = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.18, 0.1), accent)
  stripeTop.position.set(0, height / 2 + 0.7, -0.02)
  const stripeBottom = stripeTop.clone()
  stripeBottom.position.y = -height / 2 - 0.7
  group.add(bezel, stripeTop, stripeBottom)

  // mặt màn hình: áp phích khi chưa phát; "lỗ" xuyên canvas khi đang phát
  const poster = posterTexture()
  const posterMaterial = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false })
  const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending })
  const faceGeometry = new THREE.PlaneGeometry(width, height)
  const face = new THREE.Mesh(faceGeometry, posterMaterial)
  face.position.z = 0.01
  group.add(face)
  trash.push(frameMaterial, accent, bezel.geometry, stripeTop.geometry, poster, posterMaterial, holeMaterial, faceGeometry)

  // lớp CSS3D
  const css = new CSS3DRenderer()
  const layer = css.domElement
  layer.className = 'hang-tv-layer'
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;'
  host.insertBefore(layer, host.firstChild)
  const cssScene = new THREE.Scene()
  let holder: CSS3DObject | null = null
  let frame: HTMLIFrameElement | null = null

  const post = (func: string) => {
    frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT_ORIGIN)
  }

  const stop = () => {
    if (holder) {
      cssScene.remove(holder)
      holder.element.remove()
      holder = null
    }
    frame = null
    face.material = posterMaterial
  }

  return {
    play(ids) {
      const src = embedUrl(ids, { api: true, origin: window.location.origin })
      if (!src) return false
      stop()
      const iframe = document.createElement('iframe')
      iframe.src = src
      iframe.title = 'Màn hình lớn'
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
      iframe.style.cssText = `width:${FRAME_W}px;height:${FRAME_H}px;border:0;background:#000;`
      holder = new CSS3DObject(iframe)
      holder.position.copy(group.position)
      holder.rotation.copy(group.rotation)
      // khung iframe 1280 px ↔ chiều rộng màn hình (m); đẩy nhẹ ra trước mặt phẳng lỗ để không bị đè
      holder.scale.setScalar(width / FRAME_W)
      const toward = new THREE.Vector3(0, 0, 0.005).applyEuler(group.rotation)
      holder.position.add(toward)
      cssScene.add(holder)
      frame = iframe
      face.material = holeMaterial
      return true
    },
    stop,
    command(name) {
      if (!frame) return
      post({ play: 'playVideo', pause: 'pauseVideo', next: 'nextVideo', mute: 'mute', unmute: 'unMute' }[name])
    },
    get playing() {
      return holder !== null
    },
    render(camera, visible) {
      layer.style.visibility = visible && holder ? 'visible' : 'hidden'
      if (visible && holder) css.render(cssScene, camera)
    },
    resize(w, h) {
      css.setSize(w, h)
    },
    dispose() {
      stop()
      layer.remove()
      scene.remove(group)
    },
  }
}
