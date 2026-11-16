// Bố cục nhà thi đấu: bục thi đấu ở giữa, sàn phẳng, khán đài tầng tầng ở rìa mà người chơi leo lên được.
// Số liệu vật lý (bậc, ghế, tường, lối đi) nằm ở shared/world.mjs để client, server và hình ảnh dùng chung; ở đây chỉ thêm phần chỉ để vẽ.
import { STAND_GAPS } from '../../shared/world.mjs'

export { PODIUM_RADIUS, PODIUM_HEIGHT, STANDS, STANDS_OUTER, STANDS_TOP, STAND_GAPS, inStandGap } from '../../shared/world.mjs'

/**
 * Người giả chỉ để trang trí (khán giả trên khán đài, tuyển thủ ngồi trên bục thi đấu). Tạm tắt theo yêu cầu: đổi thành true để bật lại
 * (mã dựng vẫn còn nguyên trong venue.ts `addAudience` và podium.ts). Gồm cả 5 hình nộm trên bục khi không ở chế độ ném đồ (Hang.tsx); không ảnh hưởng người chơi và bot.
 */
export const SHOW_FAKE_PEOPLE = false

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Các cung có khán đài: [góc bắt đầu, độ dài] (cho LatheGeometry; góc tăng theo chiều x = sin, z = cos). */
export function standArcs(): Array<[number, number]> {
  const gaps = STAND_GAPS.map(([c, h]) => [wrapAngle(c) - h, wrapAngle(c) + h] as const).sort((a, b) => a[0] - b[0])
  const arcs: Array<[number, number]> = []
  for (let i = 0; i < gaps.length; i += 1) {
    const start = gaps[i]![1]
    let end = gaps[(i + 1) % gaps.length]![0]
    if (end <= start) end += Math.PI * 2
    arcs.push([start, end - start])
  }
  return arcs
}

