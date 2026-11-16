// Bảng màu ngoại hình: áo theo đội cổ vũ (chỉ màu + họa tiết tự vẽ, không in logo), màu da, kiểu tóc, màu tóc.
// [Inference] Màu áo các đội là màu gần đúng tôi chọn theo màu nhận diện quen thuộc của từng đội, CHƯA đối chiếu với tài liệu chính thức: chỉnh ở đây.
// Thứ tự đội khớp LOOK_TEAMS (shared/look.mjs) và LCK_TEAMS (teams.ts).
import { LOOK_TEAMS } from '../../shared/look.mjs'

export interface TeamKit {
  /** Màu thân áo / quần. */
  base: string
  /** Màu dải sườn, vai, viền tay. */
  accent: string
  /** Màu viền cổ / vạch mảnh. */
  trim: string
  /** Màu khối đơn giản cho nhân vật ở rất xa (khi chưa có ảnh nhân vật). */
  far: string
}

const KITS: Record<string, TeamKit> = {
  geng: { base: '#15151a', accent: '#b08d2c', trim: '#efe2b8', far: '#8a6d22' },
  hle: { base: '#f26a21', accent: '#1b1b20', trim: '#ffffff', far: '#d85a17' },
  t1: { base: '#17171d', accent: '#e2102c', trim: '#f6f3ee', far: '#b00f26' },
  dk: { base: '#121418', accent: '#f2f4f7', trim: '#3fd0c4', far: '#3a3f47' },
  kt: { base: '#f3f3f3', accent: '#e60012', trim: '#17171d', far: '#d9d9d9' },
  bnk: { base: '#f4c300', accent: '#17171d', trim: '#ffffff', far: '#d8ab00' },
  brion: { base: '#0f6b3a', accent: '#f2f2f2', trim: '#17171d', far: '#0d5a31' },
  ns: { base: '#c8102e', accent: '#ffffff', trim: '#17171d', far: '#a80d26' },
  drx: { base: '#1d3fbf', accent: '#ffffff', trim: '#0b1230', far: '#1a37a6' },
  soopers: { base: '#2a2f8f', accent: '#5fd0ff', trim: '#ffffff', far: '#242879' },
}

export const TEAM_KITS: TeamKit[] = LOOK_TEAMS.map((slug) => KITS[slug]!)

export const SKIN_TONES = ['#e8c3a0', '#f0d2b6', '#d9a984', '#c58f69', '#8d5a3b'] as const
export const HAIR_COLORS = ['#1b130e', '#5a3a22', '#c9a35a', '#b8323a', '#e4e4ec'] as const
export const HAIR_COLOR_NAMES = ['Đen', 'Nâu', 'Vàng', 'Đỏ', 'Bạch kim'] as const
export const HAIR_STYLE_NAMES = ['Ngắn', 'Đầu đinh', 'Dài', 'Mào'] as const
export const SKIN_NAMES = ['Sáng', 'Trắng hồng', 'Ngăm nhẹ', 'Ngăm', 'Nâu'] as const

/** Phụ kiện (xem accessories.ts): đồ trên mặt, đồ mang theo, phương tiện. */
export const FACE_NAMES = ['Không', 'Kính cận', 'Kính râm', 'Tai nghe'] as const
export const CARRY_NAMES = ['Không', 'Bình oxi', 'Gậy cổ vũ'] as const
export const RIDE_NAMES = ['Đi bộ', 'Xe lăn'] as const
