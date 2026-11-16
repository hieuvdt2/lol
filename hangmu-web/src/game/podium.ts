// Bục thi đấu ở giữa nhà thi đấu: sàn tối có đường LED hình sao, hai dãy bàn tuyển thủ hình cung đối diện nhau (bên đỏ - bên xanh),
// tấm LED cong phía sau mỗi dãy, ghế gaming, màn hình máy tính và tuyển thủ ngồi thi đấu — như sân khấu giải đấu trong ảnh tham khảo.
// Vành bục chặn người chơi cả hai chiều (shared/world.mjs); chỉ vào được qua cửa bằng cách bấm E (xem gates.ts). Bàn là vật cản thật.
import * as THREE from 'three'
import { PALETTE } from './arenaTextures.ts'
import { PODIUM_HEIGHT, PODIUM_RADIUS, SHOW_FAKE_PEOPLE } from './layout.ts'
import { PODIUM_LAYOUT, PODIUM_STATIONS } from '../../shared/world.mjs'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

const BLUE = '#5aa9e6'
const H = PODIUM_HEIGHT
/** Bán kính các dãy: ghế (trong), bàn, tấm LED (ngoài). */
const CHAIR_R = PODIUM_LAYOUT.chairR
const DESK_R = PODIUM_LAYOUT.deskR
const PANEL_R = PODIUM_LAYOUT.panelR
const STATION_STEP = PODIUM_LAYOUT.stationStep // rad giữa hai bàn (cùng số liệu với va chạm: shared/world.mjs)
const SIDES = [
  { angle: Math.PI / 2, color: PALETTE.red, screen: '#ffb0b8', shirt: '#d93a4a' }, // phía +x: Tê Đỏ
  { angle: -Math.PI / 2, color: BLUE, screen: '#b9defa', shirt: '#2f6fb0' }, // phía −x: đối thủ
] as const

/** Mặt sàn bục: nền tối, hai nửa nhuốm đỏ/xanh, vòng tròn và ngôi sao LED (như đường kẻ sàn sân khấu LCK). */
function floorTexture(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  if (g) {
    const c = size / 2
    g.fillStyle = '#10152a'
    g.fillRect(0, 0, size, size)
    const red = g.createLinearGradient(c, 0, size, 0)
    red.addColorStop(0, 'rgba(217,58,74,0)')
    red.addColorStop(1, 'rgba(217,58,74,0.45)')
    g.fillStyle = red
    g.fillRect(c, 0, c, size)
    const blue = g.createLinearGradient(c, 0, 0, 0)
    blue.addColorStop(0, 'rgba(90,169,230,0)')
    blue.addColorStop(1, 'rgba(90,169,230,0.45)')
    g.fillStyle = blue
    g.fillRect(0, 0, c, size)
    const glow = (draw: () => void, color: string, width: number) => {
      g.save()
      g.shadowColor = color
      g.shadowBlur = 18
      g.strokeStyle = color
      g.lineWidth = width
      g.lineJoin = 'round'
      draw()
      g.stroke()
      g.restore()
    }
    const px = size / (PODIUM_RADIUS * 2)
    glow(() => { g.beginPath(); g.arc(c, c, 10.7 * px, 0, Math.PI * 2) }, '#ffffff', 5)
    glow(() => { g.beginPath(); g.arc(c, c, 6.2 * px, 0, Math.PI * 2) }, 'rgba(255,255,255,0.7)', 3)
    glow(
      () => {
        g.beginPath()
        for (let i = 0; i < 5; i += 1) {
          const a = (i * 2 * Math.PI * 2) / 5 - Math.PI / 2 // ngôi sao năm cánh: nối cách một đỉnh
          g.lineTo(c + Math.cos(a) * 9.6 * px, c + Math.sin(a) * 9.6 * px)
        }
        g.closePath()
      },
      '#ffffff',
      6,
    )
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Tấm LED cong phía sau dãy bàn: các dải đứng đổi sắc như màn chiếu giới thiệu đội. */
function panelTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#0b0e18'
    g.fillRect(0, 0, 512, 64)
    for (let i = 0; i < 16; i += 1) {
      const grad = g.createLinearGradient(0, 0, 0, 64)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'rgba(255,255,255,0.15)')
      g.globalAlpha = 0.45 + 0.5 * ((i * 7) % 5) / 4
      g.fillStyle = grad
      g.fillRect(i * 32 + 3, 5, 26, 54)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function addPodium(scene: THREE.Scene, trash: Trash, lite: boolean): void {
  const group = new THREE.Group()
  scene.add(group)
  const basic = (color: string) => new THREE.MeshBasicMaterial({ color })
  const shaded = (color: string) => (lite ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }))

  // thân bục + mặt sàn + hai vòng LED
  const bodyGeometry = new THREE.CylinderGeometry(PODIUM_RADIUS, PODIUM_RADIUS + 0.3, H, 72)
  const bodyMaterial = shaded('#1a2038')
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = H / 2
  const topMap = floorTexture()
  const topGeometry = new THREE.CircleGeometry(PODIUM_RADIUS - 0.05, 72)
  topGeometry.rotateX(-Math.PI / 2)
  const topMaterial = new THREE.MeshBasicMaterial({ map: topMap })
  const top = new THREE.Mesh(topGeometry, topMaterial)
  top.position.y = H + 0.01
  const rimGeometry = new THREE.TorusGeometry(PODIUM_RADIUS + 0.02, 0.09, 6, 96)
  rimGeometry.rotateX(Math.PI / 2)
  const rim = new THREE.Mesh(rimGeometry, basic(PALETTE.cyan))
  rim.position.y = H + 0.02
  const footGeometry = new THREE.TorusGeometry(PODIUM_RADIUS + 0.28, 0.08, 6, 96)
  footGeometry.rotateX(Math.PI / 2)
  const foot = new THREE.Mesh(footGeometry, basic(PALETTE.violet))
  foot.position.y = 0.12
  group.add(body, top, rim, foot)
  trash.push(bodyGeometry, bodyMaterial, topMap, topGeometry, topMaterial, rimGeometry, rim.material as THREE.Material, footGeometry, foot.material as THREE.Material)

  // bàn, chân bàn, màn hình, ghế, người ngồi: mỗi loại một InstancedMesh
  const stations: Array<{ angle: number; side: (typeof SIDES)[number] }> = PODIUM_STATIONS.map((st) => ({ angle: st.angle, side: SIDES[st.side]! }))
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const unit = new THREE.Vector3(1, 1, 1)
  const at = (radius: number, angle: number, y: number) => new THREE.Vector3(Math.sin(angle) * radius, H + y, Math.cos(angle) * radius)
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, build: (s: (typeof stations)[number]) => { position: THREE.Vector3; yaw: number; color?: string }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, stations.length)
    stations.forEach((s, i) => {
      const { position, yaw, color } = build(s)
      turn.setFromAxisAngle(up, yaw)
      matrix.compose(position, turn, unit)
      mesh.setMatrixAt(i, matrix)
      if (color) mesh.setColorAt(i, new THREE.Color(color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
    trash.push(geometry, material)
  }
  const yawOf = (angle: number) => angle // hộp có trục X cục bộ theo tiếp tuyến (cos a, −sin a): quay quanh Y đúng góc a
  const facing = (angle: number) => angle + Math.PI // mặt (trục +z cục bộ) hướng vào tâm
  instanced(new THREE.BoxGeometry(1.7, 0.1, 0.85), shaded('#e8ebf2'), (s) => ({ position: at(DESK_R, s.angle, 0.78), yaw: yawOf(s.angle) }))
  instanced(new THREE.BoxGeometry(1.5, 0.74, 0.5), shaded('#2c303c'), (s) => ({ position: at(DESK_R, s.angle, 0.37), yaw: yawOf(s.angle) }))
  instanced(new THREE.BoxGeometry(0.78, 0.48, 0.05), basic('#ffffff'), (s) => ({ position: at(DESK_R - 0.05, s.angle, 1.1), yaw: facing(s.angle), color: s.side.screen }))
  instanced(new THREE.CylinderGeometry(0.28, 0.24, 0.1, 10), shaded('#3b4052'), (s) => ({ position: at(CHAIR_R, s.angle, 0.5), yaw: 0 }))
  instanced(new THREE.BoxGeometry(0.5, 0.62, 0.09), shaded('#3b4052'), (s) => ({ position: at(CHAIR_R - 0.3, s.angle, 0.86), yaw: yawOf(s.angle) }))
  // tuyển thủ ngồi thi đấu: thân + đầu + tai nghe (màu áo theo đội)
  if (SHOW_FAKE_PEOPLE) {
    instanced(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8), shaded('#ffffff'), (s) => ({ position: at(CHAIR_R, s.angle, 0.82), yaw: 0, color: s.side.shirt }))
    instanced(new THREE.IcosahedronGeometry(0.17, 0), shaded('#e8c3a0'), (s) => ({ position: at(CHAIR_R, s.angle, 1.28), yaw: 0 }))
  }

  // tấm LED cong phía sau mỗi dãy bàn
  for (const side of SIDES) {
    const texture = panelTexture(side.color)
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
    const length = 5 * STATION_STEP + 0.5
    const geometry = new THREE.CylinderGeometry(PANEL_R, PANEL_R, 1.6, 32, 1, true, side.angle - length / 2, length)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = H + 1.0
    // viền sáng trên và dưới tấm
    const edgeGeometry = new THREE.CylinderGeometry(PANEL_R + 0.02, PANEL_R + 0.02, 0.07, 32, 1, true, side.angle - length / 2, length)
    const edgeMaterial = basic(side.color)
    edgeMaterial.side = THREE.DoubleSide
    for (const dy of [0.2, 1.8]) {
      const edge = new THREE.Mesh(edgeGeometry, edgeMaterial)
      edge.position.y = H + dy
      group.add(edge)
    }
    group.add(mesh)
    trash.push(texture, material, geometry, edgeGeometry, edgeMaterial)
  }

}
