// Bong bóng chat trên đầu nhân vật: chữ tự xuống dòng (tối đa BUBBLE_MAX_LINES dòng), bong bóng rộng/cao theo nội dung.
// Trước đây cắt ở 48 ký tự và ép một dòng nên câu dài (vd. câu chat nhanh "Oh look at the cleanse...") bị mất chữ.
import * as THREE from 'three'

export const BUBBLE_MAX_LINES = 4
/** Bề rộng tối đa một dòng chữ (px trên canvas). */
export const BUBBLE_LINE_PX = 640
const FONT = '600 34px sans-serif'
const LINE_H = 42
const PAD_X = 26
const PAD_Y = 18
const TAIL = 28
/** m thế giới cho mỗi px canvas (giữ đúng tỉ lệ bong bóng cũ: 512 px = 2,6 m). */
const WORLD_PER_PX = 2.6 / 512

/**
 * Chia `text` thành các dòng rộng không quá `maxWidth` (theo `measure`), xuống dòng ở khoảng trắng;
 * một từ quá dài thì cắt theo ký tự. Quá `maxLines` dòng thì dòng cuối kết thúc bằng "…".
 */
export function wrapText(text: string, measure: (s: string) => number, maxWidth: number, maxLines = BUBBLE_MAX_LINES): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  const push = (s: string) => {
    lines.push(s)
  }
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (measure(next) <= maxWidth) {
      line = next
      continue
    }
    if (line) push(line)
    // từ dài hơn cả một dòng: cắt theo ký tự
    let rest = word
    while (measure(rest) > maxWidth) {
      const chars = Array.from(rest)
      let n = chars.length
      while (n > 1 && measure(chars.slice(0, n).join('')) > maxWidth) n -= 1
      push(chars.slice(0, n).join(''))
      rest = chars.slice(n).join('')
    }
    line = rest
  }
  if (line) push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]!
  while (last && measure(`${last}…`) > maxWidth) last = Array.from(last).slice(0, -1).join('')
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Tạo sprite bong bóng; gốc sprite ở mũi nhọn phía dưới (đặt sprite tại điểm trên đầu nhân vật). */
export function bubbleSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  let lines = [text]
  let textW = 0
  if (context) {
    context.font = FONT
    lines = wrapText(text, (s) => context.measureText(s).width, BUBBLE_LINE_PX)
    textW = Math.max(...lines.map((l) => context.measureText(l).width))
  }
  const boxW = Math.ceil(Math.max(160, textW + PAD_X * 2))
  const boxH = lines.length * LINE_H + PAD_Y * 2
  canvas.width = boxW + 16
  canvas.height = boxH + TAIL + 8
  if (context) {
    const cx = canvas.width / 2
    context.fillStyle = 'rgba(239,233,221,0.95)'
    context.beginPath()
    context.roundRect(8, 8, boxW, boxH, 18)
    context.fill()
    context.beginPath()
    context.moveTo(cx - 20, boxH + 6)
    context.lineTo(cx, boxH + 8 + TAIL - 2)
    context.lineTo(cx + 20, boxH + 6)
    context.fill()
    context.fillStyle = '#1f1711'
    context.font = FONT // đổi kích thước canvas làm mất cài đặt chữ
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    lines.forEach((l, i) => context.fillText(l, cx, 8 + PAD_Y + LINE_H * (i + 0.5)))
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.center.set(0.5, 0) // mũi nhọn (đáy canvas) ở vị trí sprite
  sprite.scale.set(canvas.width * WORLD_PER_PX, canvas.height * WORLD_PER_PX, 1)
  return sprite
}
