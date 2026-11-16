// Họa tiết canvas cho đấu trường: tấm ốp lục giác (mô-típ riêng của Hang Tê Đỏ), mặt sàn có vòng chữ, biển khu khán đài.
// Tất cả tự vẽ, không dùng ảnh ngoài. Bảng màu nhà thi đấu esport: nền xanh than đậm, đèn LED xanh lam/lục lam; đỏ và xanh dương chỉ dành cho hai phe trên bục.
import * as THREE from 'three'

export const PALETTE = {
  /** Màu phe Tê Đỏ (chỉ dùng cho phe này: bàn thi đấu, màn LED, biểu ngữ); đỏ dịu hơn đỏ neon để không chói. */
  red: '#d93a4a',
  redDeep: '#a82434',
  redSoft: '#ff8c98',
  /** Màu phe đối thủ. */
  blue: '#5aa9e6',
  /** Màu nhấn của đấu trường: đèn LED viền bậc, vòng sàn, giàn đèn. */
  cyan: '#3fc8ff',
  violet: '#8a6cff',
  gold: '#f2c14e',
  white: '#f4f6fa',
  panel: '#2a3350',
  panelLine: '#46567e',
  steel: '#8a97b5',
  charcoal: '#141a2c',
  /** Trắng lạnh của đèn LED. */
  warm: '#cfeaff',
} as const

/** Chế độ nhẹ (localStorage `hangmu.lite` = '1'): xem venue.ts. */
function lowDetail(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('hangmu.lite') === '1'
  } catch {
    return false
  }
}

const finish = (canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = lowDetail() ? 1 : 4 // lọc dị hướng rất tốn trên WebGL phần mềm; chế độ nhẹ tắt
  return texture
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  return { canvas, g: canvas.getContext('2d') }
}

/** Mặt vòm trần: một màu xanh than liền (không họa tiết); vẫn là CanvasTexture để giữ chung đường dẫn vật liệu với bản cũ. */
export function domeTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const { canvas, g } = makeCanvas(8)
  if (g) {
    g.fillStyle = '#363f5a'
    g.fillRect(0, 0, 8, 8)
  }
  return finish(canvas, repeatX, repeatY)
}

/**
 * Mặt sàn đấu trường: nền xanh than liền, các vòng kẻ lục lam/trắng đồng tâm và mũi tên chỉ về lối vào (không có chữ).
 * Một ảnh phủ cả đĩa bán kính `outer` (m): tâm ảnh là tâm hang.
 */
export function arenaFloorTexture(outer: number, inner: number): THREE.CanvasTexture {
  const size = 2048
  const { canvas, g } = makeCanvas(size)
  if (!g) return finish(canvas)
  const px = size / (outer * 2) // điểm ảnh trên mét
  const c = size / 2
  g.fillStyle = '#262e46'
  g.fillRect(0, 0, size, size)
  // vòng đồng tâm: dải đỏ dày, dải trắng, vạch mảnh
  const ring = (radiusM: number, widthM: number, color: string) => {
    g.strokeStyle = color
    g.lineWidth = widthM * px
    g.beginPath()
    g.arc(c, c, radiusM * px, 0, Math.PI * 2)
    g.stroke()
  }
  ring(inner + 1.2, 0.5, '#ffffff')
  ring(inner + 1.9, 0.9, PALETTE.cyan)
  ring(inner + 2.7, 0.25, '#ffffff')
  ring(outer - 4, 0.3, PALETTE.cyan)
  ring(outer - 5, 0.15, '#5d6c92')
  // mũi tên chỉ lối vào (hướng +z ứng với phía dưới ảnh) và bốn hướng khác nhạt hơn
  const arrow = (angle: number, radiusM: number, alpha: number) => {
    g.save()
    g.translate(c, c)
    g.rotate(angle)
    g.translate(0, radiusM * px)
    g.fillStyle = `rgba(63,200,255,${alpha})`
    g.beginPath()
    g.moveTo(0, 1.4 * px)
    g.lineTo(-1.5 * px, -1 * px)
    g.lineTo(1.5 * px, -1 * px)
    g.closePath()
    g.fill()
    g.restore()
  }
  arrow(0, outer * 0.78, 0.85)
  for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) arrow(a, outer * 0.78, 0.35)
  return finish(canvas)
}

/** Biển khu khán đài (A, B, C, D): nền trắng viền đỏ, chữ cái lớn. */
export function sectionSignTexture(letter: string): THREE.CanvasTexture {
  const { canvas, g } = makeCanvas(256)
  if (!g) return finish(canvas)
  g.fillStyle = '#f4f6fa'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = PALETTE.cyan
  g.fillRect(0, 0, 256, 36)
  g.fillRect(0, 220, 256, 36)
  g.fillStyle = PALETTE.charcoal
  g.font = '800 150px "Be Vietnam Pro", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(letter, 128, 132)
  return finish(canvas)
}
