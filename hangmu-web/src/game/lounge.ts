// Phòng chờ: thảm, ba bộ sofa quay vào bàn thấp, tấm màn hai mặt phía bắc (bảng xếp hạng LCK) và dải LED viền thảm.
// Hình dạng khớp đúng các hộp va chạm và ghế trong shared/world.mjs (LOUNGE_SOFAS, LOUNGE_TABLE, LOUNGE_SCREEN, LOUNGE_SEATS).
import * as THREE from 'three'
import { LOUNGE, LOUNGE_SCREEN, LOUNGE_SOFAS, LOUNGE_TABLE, LOUNGE_WALLS, LOUNGE_WALL_HEIGHT, SOFA } from '../../shared/world.mjs'
import { PALETTE } from './arenaTextures.ts'
import { BOARD_H, BOARD_W, drawLckBoard } from './lckBoard.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

const RUG_W = 15
const RUG_D = 13

function rugTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 666
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#1c2548'
    g.fillRect(0, 0, 768, 666)
    g.strokeStyle = PALETTE.cyan
    g.lineWidth = 10
    g.strokeRect(16, 16, 736, 634)
    g.strokeStyle = 'rgba(138,108,255,0.7)'
    g.lineWidth = 5
    g.strokeRect(40, 40, 688, 586)
    g.fillStyle = 'rgba(63,200,255,0.08)'
    for (let i = 0; i < 8; i += 1) g.fillRect(70 + i * 82, 70, 38, 526)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function signTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 128
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#0d2a52'
    g.fillRect(0, 0, 1024, 128)
    g.strokeStyle = PALETTE.cyan
    g.lineWidth = 8
    g.strokeRect(4, 4, 1016, 120)
    g.fillStyle = '#ffffff'
    g.font = '800 72px "Be Vietnam Pro", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 512, 70)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function addLounge(scene: THREE.Scene, trash: Trash, lite: boolean): void {
  const group = new THREE.Group()
  scene.add(group)
  const shaded = (color: string) => (lite ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }))

  // thảm + dải LED viền
  const rugMap = rugTexture()
  const rugGeometry = new THREE.PlaneGeometry(RUG_W, RUG_D)
  rugGeometry.rotateX(-Math.PI / 2)
  const rugMaterial = new THREE.MeshBasicMaterial({ map: rugMap })
  const rug = new THREE.Mesh(rugGeometry, rugMaterial)
  rug.position.set(LOUNGE.center.x, 0.02, LOUNGE.center.z)
  group.add(rug)
  trash.push(rugMap, rugGeometry, rugMaterial)

  // tường kính quanh phòng chờ (đúng các hộp va chạm) + dải LED trên đỉnh: chỉ vào được qua cửa (gates.ts)
  const wallGlass = new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
  const wallTrim = new THREE.MeshBasicMaterial({ color: PALETTE.cyan })
  trash.push(wallGlass, wallTrim)
  for (const wall of LOUNGE_WALLS) {
    const holder = new THREE.Group()
    holder.position.set(wall.x, 0, wall.z)
    holder.rotation.y = wall.angle
    const hw = wall.hw ?? 1
    const hd = wall.hd ?? 0.15
    const panel = new THREE.BoxGeometry(hw * 2, LOUNGE_WALL_HEIGHT, hd * 2)
    const top = new THREE.BoxGeometry(hw * 2, 0.08, hd * 2 + 0.04)
    const mesh = new THREE.Mesh(panel, wallGlass)
    mesh.position.y = LOUNGE_WALL_HEIGHT / 2
    const strip = new THREE.Mesh(top, wallTrim)
    strip.position.y = LOUNGE_WALL_HEIGHT
    holder.add(mesh, strip)
    group.add(holder)
    trash.push(panel, top)
  }

  // sofa: đế, lưng, hai tay vịn, đệm cho từng chỗ ngồi (trục z cục bộ = hướng mặt người ngồi, lưng ở −z)
  const frame = shaded('#3a4a86')
  const cushion = shaded('#6a84d8')
  const trim = new THREE.MeshBasicMaterial({ color: PALETTE.cyan })
  trash.push(frame, cushion, trim)
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const geometry = new THREE.BoxGeometry(w, h, d)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    trash.push(geometry)
  }
  for (const sofa of LOUNGE_SOFAS) {
    const holder = new THREE.Group()
    holder.position.set(sofa.x, 0, sofa.z)
    holder.rotation.y = sofa.angle
    const depth = SOFA.depth
    box(sofa.length, 0.3, depth, frame, 0, 0.15, 0, holder)
    box(sofa.length, 0.62, 0.24, frame, 0, 0.61, -depth / 2 + 0.12, holder) // lưng ghế
    for (const side of [-1, 1]) box(0.2, 0.5, depth, frame, side * (sofa.length / 2 - 0.1), 0.4, 0, holder) // tay vịn
    for (let k = 0; k < sofa.seats; k += 1) {
      const x = (k - (sofa.seats - 1) / 2) * SOFA.seatSpacing
      box(SOFA.seatSpacing - 0.08, 0.16, depth - 0.3, cushion, x, SOFA.height - 0.08, 0.1, holder)
    }
    box(sofa.length, 0.05, 0.05, trim, 0, 0.95, -depth / 2 + 0.12, holder) // vạch LED trên lưng
    group.add(holder)
  }

  // bàn thấp: mặt kính tối, viền LED, bốn chân
  const table = new THREE.Group()
  table.position.set(LOUNGE_TABLE.x, 0, LOUNGE_TABLE.z)
  table.rotation.y = LOUNGE_TABLE.angle
  const glass = shaded('#1b2342')
  trash.push(glass)
  box(LOUNGE_TABLE.hw * 2, 0.06, LOUNGE_TABLE.hd * 2, glass, 0, LOUNGE_TABLE.height, 0, table)
  box(LOUNGE_TABLE.hw * 2 + 0.06, 0.03, LOUNGE_TABLE.hd * 2 + 0.06, trim, 0, LOUNGE_TABLE.height - 0.04, 0, table)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, LOUNGE_TABLE.height, 0.08, frame, sx * (LOUNGE_TABLE.hw - 0.1), LOUNGE_TABLE.height / 2, sz * (LOUNGE_TABLE.hd - 0.1), table)
  group.add(table)

  // tấm màn đứng hai mặt: bảng xếp hạng LCK (một mặt quay vào phòng chờ, một mặt quay ra sân) + biển tên phòng
  const canvas = document.createElement('canvas')
  canvas.width = BOARD_W
  canvas.height = BOARD_H
  const ctx = canvas.getContext('2d')
  if (ctx) drawLckBoard(ctx)
  const boardMap = new THREE.CanvasTexture(canvas)
  boardMap.colorSpace = THREE.SRGBColorSpace
  boardMap.anisotropy = 4
  const boardMaterial = new THREE.MeshBasicMaterial({ map: boardMap, toneMapped: false })
  const signMap = signTexture('PHÒNG CHỜ')
  const signMaterial = new THREE.MeshBasicMaterial({ map: signMap, toneMapped: false })
  const { width, height, bottom } = LOUNGE_SCREEN
  const centerY = bottom + height / 2
  const screen = new THREE.Group()
  screen.position.set(LOUNGE_SCREEN.x, 0, LOUNGE_SCREEN.z)
  const casing = shaded('#10162c')
  trash.push(casing, boardMap, boardMaterial, signMap, signMaterial)
  box(width + 0.3, height + 0.3, 0.12, casing, 0, centerY, 0, screen)
  const plane = new THREE.PlaneGeometry(width, height)
  trash.push(plane)
  const front = new THREE.Mesh(plane, boardMaterial) // quay về +z (vào phòng chờ)
  front.position.set(0, centerY, 0.07)
  const back = new THREE.Mesh(plane, boardMaterial)
  back.position.set(0, centerY, -0.07)
  back.rotation.y = Math.PI
  screen.add(front, back)
  for (const side of [-1, 1]) box(0.16, centerY + height / 2 + 0.2, 0.16, casing, side * (width / 2 + 0.05), (centerY + height / 2 + 0.2) / 2, 0, screen)
  const signGeometry = new THREE.PlaneGeometry(width, (width * 128) / 1024)
  trash.push(signGeometry)
  const signY = centerY + height / 2 + 0.2 + (width * 128) / 1024 / 2
  const signFront = new THREE.Mesh(signGeometry, signMaterial)
  signFront.position.set(0, signY, 0.09)
  const signBack = new THREE.Mesh(signGeometry, signMaterial)
  signBack.position.set(0, signY, -0.09)
  signBack.rotation.y = Math.PI
  screen.add(signFront, signBack)
  box(width + 0.3, 0.06, 0.16, trim, 0, bottom - 0.2, 0, screen)
  group.add(screen)
}
