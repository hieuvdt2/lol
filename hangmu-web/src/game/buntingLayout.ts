// Cờ tam giác giăng trên trần hang (thấy trên ảnh chụp bản gốc: đỏ / đen / trắng xen kẽ). Phần bố trí là hàm thuần để kiểm thử.

export interface Pennant {
  x: number
  y: number
  z: number
  /** Góc quay quanh trục Y: mặt lá cờ chứa hướng của dây. */
  rotY: number
  /** Chỉ số màu: 0 đỏ, 1 đen, 2 trắng. */
  color: 0 | 1 | 2
}
export interface Strand {
  /** Các điểm của dây (đã võng xuống) để vẽ đường dây. */
  points: Array<[number, number, number]>
  pennants: Pennant[]
}
export interface BuntingOptions {
  /** Bán kính vòng mốc treo. */
  radius?: number
  /** Độ cao mốc treo. */
  height?: number
  /** Số điểm treo quanh vòng (nối cách một điểm, nên cần chẵn hoặc lẻ đều được). */
  anchors?: number
  /** Độ võng giữa dây (tỉ lệ so với độ dài dây). */
  sag?: number
  /** Khoảng cách giữa hai lá cờ. */
  spacing?: number
  /** Số đoạn thẳng vẽ mỗi dây. */
  segments?: number
}

export const BUNTING_COLORS = ['#2f7de1', '#1b2340', '#dce8ff'] as const

/** Dây cờ nối các điểm treo cách nhau một điểm quanh vòng tròn. */
export function buntingLayout({ radius = 44, height = 17.5, anchors = 7, sag = 0.07, spacing = 1.7, segments = 28 }: BuntingOptions = {}): Strand[] {
  const strands: Strand[] = []
  const at = (i: number): [number, number] => {
    const a = (i / anchors) * Math.PI * 2 + 0.3
    return [Math.sin(a) * radius, Math.cos(a) * radius]
  }
  let colour = 0
  for (let i = 0; i < anchors; i += 1) {
    const [ax, az] = at(i)
    const [bx, bz] = at((i + 2) % anchors)
    const length = Math.hypot(bx - ax, bz - az)
    const drop = length * sag
    const point = (t: number): [number, number, number] => [ax + (bx - ax) * t, height - drop * 4 * t * (1 - t), az + (bz - az) * t]
    const points = Array.from({ length: segments + 1 }, (_, k) => point(k / segments))
    const count = Math.max(1, Math.floor(length / spacing) - 1)
    const rotY = Math.atan2(bx - ax, bz - az) + Math.PI / 2
    const pennants: Pennant[] = []
    for (let k = 1; k <= count; k += 1) {
      const [x, y, z] = point(k / (count + 1))
      pennants.push({ x, y, z, rotY, color: (colour % 3) as 0 | 1 | 2 })
      colour += 1
    }
    strands.push({ points, pennants })
  }
  return strands
}
