// Hiệu ứng phía người bị đấm: rung camera ngắn. (Bản gốc không có trong capture — [Inference] tự thiết kế.)

export const SHAKE_DURATION_MS = 420
export const SHAKE_AMPLITUDE = 0.28

/** Độ lệch camera (đơn vị thế giới) sau `ageMs` kể từ lúc trúng đòn: tắt dần theo hàm mũ, về đúng 0 khi hết thời gian. */
export function punchShake(ageMs: number, amplitude = SHAKE_AMPLITUDE): { x: number; y: number } {
  if (!(ageMs >= 0) || ageMs >= SHAKE_DURATION_MS) return { x: 0, y: 0 }
  const t = ageMs / 1000
  // cửa sổ mượt về 0 ở cuối để không bị giật khi dừng
  const fade = Math.exp(-t / 0.12) * (1 - ageMs / SHAKE_DURATION_MS)
  return { x: Math.sin(t * 62) * amplitude * fade, y: Math.cos(t * 83) * amplitude * 0.7 * fade }
}
