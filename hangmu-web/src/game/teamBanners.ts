// Biểu ngữ các đội LCK treo quanh vách đấu trường: mỗi đội một tấm dọc (hạng, logo hoặc huy hiệu chữ cái, tên, vé quốc tế, thành tích).
// Treo cách trục đủ gần để đỉnh biểu ngữ nằm dưới mặt vòm (trước đây biểu ngữ và khung chân dung cao quá nên bị vòm cắt mất nửa trên).
import * as THREE from 'three'
import { PALETTE } from './arenaTextures.ts'
import { LCK_TEAMS, LOGO_FILES, wrapLines } from './teams.ts'
import type { LckTeam } from './teams.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

const W = 512
const H = 896
/** Kích thước biểu ngữ trong cảnh (m) và vị trí treo. */
export const TEAM_BANNER = { width: 4, height: (4 * H) / W, distance: 48, bottom: 6.7 } as const
/** Góc treo (quanh trục hang; 0 = lối vào phía nam, π = hội trường phía bắc): năm tấm mỗi bên, chừa cửa vào, hội trường và bảng treo ở vách bắc. */
export const TEAM_BANNER_ANGLES = [0.75, 1.15, 1.55, 1.95, 2.35, -0.75, -1.15, -1.55, -1.95, -2.35] as const

const TICKET_COLOR: Record<string, string> = { 'CKTG 2026': PALETTE.gold, 'DCGI 2026': PALETTE.violet }

/** Vẽ một biểu ngữ; `logo` là ảnh đã tải (nếu có), thiếu thì vẽ huy hiệu chữ cái. */
export function drawTeamBanner(g: CanvasRenderingContext2D, team: LckTeam, logo: CanvasImageSource | null, logoSize?: { w: number; h: number }): void {
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16224a')
  bg.addColorStop(1, '#0a1020')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.strokeStyle = PALETTE.cyan
  g.lineWidth = 8
  g.strokeRect(10, 10, W - 20, H - 20)
  // hạng
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = PALETTE.cyan
  g.font = '800 120px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillText(`#${team.rank}`, W / 2, 110)
  // tấm nền sáng đỡ logo (logo tối trên nền trong suốt)
  const plate = { x: 56, y: 200, w: W - 112, h: 250 }
  g.fillStyle = '#eef3ff'
  g.beginPath()
  g.roundRect(plate.x, plate.y, plate.w, plate.h, 28)
  g.fill()
  if (logo && logoSize) {
    const k = Math.min((plate.w - 50) / logoSize.w, (plate.h - 40) / logoSize.h)
    const w = logoSize.w * k
    const h = logoSize.h * k
    g.drawImage(logo, plate.x + (plate.w - w) / 2, plate.y + (plate.h - h) / 2, w, h)
  } else {
    g.fillStyle = '#1c2a55'
    g.font = `800 ${team.initials.length > 2 ? 110 : 140}px "Be Vietnam Pro", system-ui, sans-serif`
    g.fillText(team.initials, W / 2, plate.y + plate.h / 2 + 6)
  }
  // tên đội
  g.fillStyle = '#ffffff'
  g.font = '800 64px "Be Vietnam Pro", system-ui, sans-serif'
  const nameLines = wrapLines(team.name, W - 70, (s) => g.measureText(s).width)
  nameLines.forEach((line, i) => g.fillText(line, W / 2, 520 + i * 70))
  // vé quốc tế
  const chipY = 520 + nameLines.length * 70 + 36
  g.fillStyle = TICKET_COLOR[team.ticket] ?? '#4a5578'
  g.beginPath()
  g.roundRect(70, chipY - 34, W - 140, 68, 34)
  g.fill()
  g.fillStyle = TICKET_COLOR[team.ticket] ? '#10162c' : '#dfe6ff'
  g.font = '700 38px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillText(team.ticket === 'Không có' ? 'Không có vé quốc tế' : `Vé ${team.ticket}`, W / 2, chipY + 2)
  // thành tích
  g.fillStyle = '#b8c4e8'
  g.font = '500 34px "Be Vietnam Pro", system-ui, sans-serif'
  wrapLines(team.note, W - 90, (s) => g.measureText(s).width).forEach((line, i) => g.fillText(line, W / 2, chipY + 80 + i * 44))
}

export function addTeamBanners(scene: THREE.Scene, trash: Trash): void {
  const { width, height, distance, bottom } = TEAM_BANNER
  const geometry = new THREE.PlaneGeometry(width, height)
  const back = new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.1)
  const backMaterial = new THREE.MeshStandardMaterial({ color: '#0a1020', roughness: 0.6, metalness: 0.3 })
  trash.push(geometry, back, backMaterial)
  LCK_TEAMS.forEach((team, index) => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const g = canvas.getContext('2d')
    if (!g) return
    drawTeamBanner(g, team, null)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    const angle = TEAM_BANNER_ANGLES[index] ?? 0
    const holder = new THREE.Group()
    holder.position.set(Math.sin(angle) * distance, bottom + height / 2, Math.cos(angle) * distance)
    holder.rotation.y = angle + Math.PI // mặt hướng về tâm hang
    const board = new THREE.Mesh(back, backMaterial)
    board.position.z = -0.06
    const face = new THREE.Mesh(geometry, material)
    holder.add(board, face)
    scene.add(holder)
    trash.push(texture, material)
    if (LOGO_FILES.has(team.slug)) {
      const image = new Image()
      image.onload = () => {
        drawTeamBanner(g, team, image, { w: image.naturalWidth, h: image.naturalHeight })
        texture.needsUpdate = true
      }
      image.src = `/teams/${team.slug}.png`
    }
  })
}
