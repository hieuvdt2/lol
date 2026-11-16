// Bảng xếp hạng LCK vẽ lên canvas (treo ở vách bắc). Số liệu từ teams.ts do chủ dự án nhập tay, không phải dữ liệu trực tiếp.
import { PALETTE } from './arenaTextures.ts'
import { LCK_TEAMS } from './teams.ts'

export const BOARD_W = 1024
export const BOARD_H = 576

const TICKET_COLOR: Record<string, string> = { 'CKTG 2026': PALETTE.gold, 'DCGI 2026': PALETTE.violet }

/** Đội "của hang" (được tô nổi trên bảng). */
export const HOME_TEAM = 'T1'

/** Vẽ bảng lên canvas BOARD_W × BOARD_H: hai cột năm đội, mỗi dòng gồm hạng, tên đội và vé quốc tế. */
export function drawLckBoard(ctx: CanvasRenderingContext2D, w = BOARD_W, h = BOARD_H): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#13204a')
  bg.addColorStop(1, '#0a1020')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  // thanh tiêu đề
  ctx.fillStyle = '#0d2a52'
  ctx.fillRect(0, 0, w, 84)
  ctx.fillStyle = PALETTE.cyan
  ctx.fillRect(0, 84, w, 4)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 46px Bitter, Georgia, serif'
  ctx.fillText('BẢNG XẾP HẠNG LCK 2026', 40, 44)

  const colW = (w - 120) / 2
  const rowH = 74
  LCK_TEAMS.forEach((team, i) => {
    const col = i < 5 ? 0 : 1
    const row = i % 5
    const x = 40 + col * (colW + 40)
    const y = 112 + row * (rowH + 8)
    const home = team.name === HOME_TEAM
    ctx.fillStyle = home ? 'rgba(217,58,74,0.28)' : 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.roundRect(x, y, colW, rowH, 14)
    ctx.fill()
    if (home) {
      ctx.strokeStyle = PALETTE.red
      ctx.lineWidth = 3
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = PALETTE.cyan
    ctx.font = '900 40px Bitter, Georgia, serif'
    ctx.fillText(`${team.rank}`, x + 38, y + rowH / 2 + 2)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 30px sans-serif'
    ctx.fillText(team.name, x + 84, y + rowH / 2 - 11)
    const color = TICKET_COLOR[team.ticket]
    ctx.fillStyle = color ?? '#8a97b5'
    ctx.font = '700 22px sans-serif'
    ctx.fillText(team.ticket === 'Không có' ? 'Không có vé quốc tế' : `Vé ${team.ticket}`, x + 84, y + rowH / 2 + 20)
  })

  ctx.textAlign = 'center'
  ctx.font = '500 21px sans-serif'
  ctx.fillStyle = '#7f8db0'
  ctx.fillText('Số liệu nhập tay, không phải dữ liệu trực tiếp', w / 2, h - 20)
  ctx.strokeStyle = PALETTE.cyan
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, w - 6, h - 6)
}
