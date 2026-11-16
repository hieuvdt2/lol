// Cửa vào các khu đặc biệt: hai ô sáng trên sàn đánh dấu chỗ đứng ở hai đầu cửa; riêng phòng chờ có thêm cổng vòm hai mặt ghi tên khu và "bấm E"
// ở hai đầu cửa. Kèm hàng rào kính quanh vành bục thi đấu (phần va chạm nằm ở shared/world.mjs: keepOffRim). Chỉ là hình ảnh.
import * as THREE from 'three'
import { GATES, floorHeight } from '../../shared/world.mjs'
import { PALETTE } from './arenaTextures.ts'
import { PODIUM_HEIGHT, PODIUM_RADIUS } from './layout.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

function labelTexture(title: string, hint: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 192
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#0d2a52'
    g.fillRect(0, 0, 768, 192)
    g.strokeStyle = PALETTE.cyan
    g.lineWidth = 8
    g.strokeRect(4, 4, 760, 184)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.font = '800 76px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillText(title, 384, 76)
    g.fillStyle = PALETTE.cyan
    g.font = '700 46px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillText(hint, 384, 148)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function addGates(scene: THREE.Scene, trash: Trash, lite: boolean): void {
  const shaded = (color: string) => (lite ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }))
  const post = shaded('#1a2036')
  const glow = new THREE.MeshBasicMaterial({ color: PALETTE.cyan })
  const pad = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
  const padGeometry = new THREE.RingGeometry(0.55, 0.9, 32)
  padGeometry.rotateX(-Math.PI / 2)
  const postGeometry = new THREE.BoxGeometry(0.28, 3.2, 0.28)
  const beamGeometry = new THREE.BoxGeometry(3.1, 0.3, 0.3)
  const stripGeometry = new THREE.BoxGeometry(3.1, 0.06, 0.34)
  const plane = new THREE.PlaneGeometry(2.6, 0.65)
  trash.push(post, glow, pad, padGeometry, postGeometry, beamGeometry, stripGeometry, plane)

  for (const gate of GATES) {
    for (const end of [gate.outside, gate.inside]) {
      const mark = new THREE.Mesh(padGeometry, pad)
      mark.position.set(end.x, floorHeight(end.x, end.z) + 0.04, end.z)
      scene.add(mark)
    }
    // Sân thi đấu không dựng cổng vòm/biển (theo yêu cầu: không che khu thi đấu); chỉ còn ô sáng trên sàn và chữ gợi ý "bấm E".
    if (gate.id === 'podium') continue
    const cx = (gate.outside.x + gate.inside.x) / 2
    const cz = (gate.outside.z + gate.inside.z) / 2
    const ax = gate.inside.x - gate.outside.x
    const az = gate.inside.z - gate.outside.z
    const baseY = Math.max(floorHeight(gate.outside.x, gate.outside.z), floorHeight(gate.inside.x, gate.inside.z))
    const arch = new THREE.Group()
    arch.position.set(cx, baseY, cz)
    arch.rotation.y = Math.atan2(-ax, -az) // trục z cục bộ hướng ra phía ngoài
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(postGeometry, post)
      m.position.set(side * 1.5, 1.6, 0)
      arch.add(m)
    }
    const beam = new THREE.Mesh(beamGeometry, post)
    beam.position.set(0, 3.2, 0)
    const strip = new THREE.Mesh(stripGeometry, glow)
    strip.position.set(0, 3.02, 0)
    arch.add(beam, strip)
    const outMap = labelTexture(gate.label.toUpperCase(), 'Bấm E để vào')
    const inMap = labelTexture(gate.label.toUpperCase(), 'Bấm E để ra ngoài')
    const outMaterial = new THREE.MeshBasicMaterial({ map: outMap, toneMapped: false })
    const inMaterial = new THREE.MeshBasicMaterial({ map: inMap, toneMapped: false })
    const outFace = new THREE.Mesh(plane, outMaterial)
    outFace.position.set(0, 3.7, 0.16)
    const inFace = new THREE.Mesh(plane, inMaterial)
    inFace.position.set(0, 3.7, -0.16)
    inFace.rotation.y = Math.PI
    arch.add(outFace, inFace)
    scene.add(arch)
    trash.push(outMap, inMap, outMaterial, inMaterial)
  }

  // hàng rào kính quanh vành bục thi đấu + dải LED trên đỉnh
  const rail = 0.95
  const glassGeometry = new THREE.CylinderGeometry(PODIUM_RADIUS, PODIUM_RADIUS, rail, 96, 1, true)
  const glass = new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  const glassMesh = new THREE.Mesh(glassGeometry, glass)
  glassMesh.position.y = PODIUM_HEIGHT + rail / 2
  scene.add(glassMesh)
  const topGeometry = new THREE.TorusGeometry(PODIUM_RADIUS, 0.05, 6, 120)
  topGeometry.rotateX(Math.PI / 2)
  const top = new THREE.Mesh(topGeometry, glow)
  top.position.y = PODIUM_HEIGHT + rail
  scene.add(top)
  trash.push(glassGeometry, glass, topGeometry)
}
