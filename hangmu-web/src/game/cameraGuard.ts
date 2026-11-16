// Giữ camera ở NGOÀI các khối đặc (khán đài, bục thi đấu, bệ sân khấu hội trường).
// Camera đứng sau lưng người chơi: khi người chơi sát chân khán đài mà quay lưng ra phía khán đài, camera nằm lọt trong thân khán đài
// và (vì thân khán đài vẽ hai mặt) thấy cả đáy/mặt trong của các bậc. Hàm dưới đây cho biết đoạn nhìn từ người chơi tới camera có xuyên khối đặc không.
import { HALL_BENCHES, LOUNGE_SCREEN, LOUNGE_SOFAS, LOUNGE_TABLE, LOUNGE_WALLS, LOUNGE_WALL_HEIGHT, PODIUM_HEIGHT, PODIUM_LAYOUT, PODIUM_RADIUS, PODIUM_STATIONS, SOFA, STAGE, floorHeight, inLounge } from '../../shared/world.mjs'

interface Furniture { x: number; z: number; angle: number; hw: number; hd: number; top: number }
/** Đồ đạc cao hơn sàn mà camera không được chui vào: sofa, bàn, tấm màn, tường kính phòng chờ, ghế hội trường, bàn và bệ cúp trên bục, vòm cổng vào. */
const FURNITURE: Furniture[] = [
  ...LOUNGE_SOFAS.map((s) => ({ x: s.x, z: s.z, angle: s.angle, hw: s.length / 2, hd: SOFA.depth / 2, top: 0.95 })),
  { x: LOUNGE_TABLE.x, z: LOUNGE_TABLE.z, angle: LOUNGE_TABLE.angle, hw: LOUNGE_TABLE.hw, hd: LOUNGE_TABLE.hd, top: 0.5 },
  { x: LOUNGE_SCREEN.x, z: LOUNGE_SCREEN.z, angle: 0, hw: LOUNGE_SCREEN.halfW, hd: LOUNGE_SCREEN.halfD, top: 5.4 },
  ...LOUNGE_WALLS.map((w) => ({ x: w.x, z: w.z, angle: w.angle, hw: w.hw ?? 1, hd: w.hd ?? 0.15, top: LOUNGE_WALL_HEIGHT })),
  ...HALL_BENCHES.map((b) => ({ x: b.x, z: b.z, angle: 0, hw: 1.1, hd: 0.375, top: 0.46 })),
  ...PODIUM_STATIONS.map((st) => ({ x: Math.sin(st.angle) * PODIUM_LAYOUT.deskR, z: Math.cos(st.angle) * PODIUM_LAYOUT.deskR, angle: st.angle, hw: PODIUM_LAYOUT.deskHalfW, hd: PODIUM_LAYOUT.deskHalfD, top: PODIUM_HEIGHT + 0.9 })),
  { x: 0, z: 57.8, angle: 0, hw: 10, hd: 4.8, top: 14 }, // vòm cổng vào phía nam: camera lọt vào trong thấy mặt trong của vòm
  { x: 0, z: 0, angle: 0, hw: PODIUM_LAYOUT.pedestal, hd: PODIUM_LAYOUT.pedestal, top: PODIUM_HEIGHT + 1.2 },
]

function furnitureTop(x: number, z: number): number {
  let top = 0
  for (const f of FURNITURE) {
    if (f.top <= top) continue
    const dx = x - f.x
    const dz = z - f.z
    const u = dx * Math.cos(f.angle) - dz * Math.sin(f.angle) // cùng quy ước hộp xoay với pushOutOfBox
    const d = dx * Math.sin(f.angle) + dz * Math.cos(f.angle)
    if (Math.abs(u) <= f.hw && Math.abs(d) <= f.hd) top = f.top
  }
  return top
}

/** Chiều cao bệ sân khấu hội trường (dưới màn hình YouTube). */
export const HALL_PLINTH = 3.6
/** Trên độ cao này camera được bay qua phòng chờ (cao hơn tấm màn và biển). */
const LOUNGE_CEILING = 6
/** Bán kính các vòng điểm dò quanh camera (m). */
const NEAR_RINGS = [0.12, 0.24, 0.35]
/** Camera phải cách mặt khối đặc ít nhất ngần này (m). */
export const CAMERA_CLEARANCE = 0.45

/** Độ cao mặt trên của khối đặc tại (x, z): bậc khán đài, bục thi đấu, bệ hội trường hoặc đồ đạc (sofa, tường kính...); 0 ở sàn phẳng. */
export function solidTop(x: number, z: number): number {
  let top = floorHeight(x, z)
  if (Math.hypot(x, z) < PODIUM_RADIUS + 0.3) top = Math.max(top, PODIUM_HEIGHT)
  if (Math.abs(x) < STAGE.halfW + 1 && Math.abs(z - STAGE.z) < STAGE.halfD) top = Math.max(top, HALL_PLINTH)
  return Math.max(top, furnitureTop(x, z))
}

/**
 * Đoạn từ mắt người chơi (px, py, pz) tới camera (cx, cy, cz) có chui xuống dưới mặt khối đặc không (hoặc camera nằm sát/trong khối)?
 * Lấy mẫu dọc đoạn; mỗi mẫu phải cao hơn mặt khối đặc ít nhất CAMERA_CLEARANCE.
 */
export function cameraBlocked(px: number, py: number, pz: number, cx: number, cy: number, cz: number): boolean {
  const inside = inLounge(px, pz)
  // Mẫu cách nhau ≤ 0,15 m (tường kính dày 0,3 m): 10 mẫu cố định trên đoạn dài thì có lúc lọt qua tường, lúc không →
  // khoảng cách camera chập chờn khi người chơi chạy (giật).
  const steps = Math.max(10, Math.ceil(Math.hypot(cx - px, cz - pz) / 0.15))
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const x = px + (cx - px) * t
    const z = pz + (cz - pz) * t
    const y = py + (cy - py) * t
    if (y < solidTop(x, z) + CAMERA_CLEARANCE) return true
    // Phòng chờ là khu kín (tường kính + tấm màn cao): người ở ngoài thì camera không thò vào trong, người ở trong thì camera không ra ngoài
    // (trừ khi đã cao hơn tấm màn), để đứng ở chỗ xuất hiện ngay trước phòng chờ không bị tấm màn che kín màn hình.
    if (y < LOUNGE_CEILING && inLounge(x, z) !== inside) return true
  }
  // mặt phẳng gần của camera rộng ~0,3 m: đứng sát chân một bậc cao hơn cũng cắt vào mặt đứng của bậc, nên xét cả bốn điểm quanh camera
  // (dò cả các điểm giữa: chỉ 4 điểm ở 0,35 m thì tường kính dày 0,3 m lọt giữa tâm và điểm dò → camera chập chờn ở mép tường)
  for (const r of NEAR_RINGS) {
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      if (cy < solidTop(cx + dx, cz + dz) + 0.1) return true
    }
  }
  return false
}
