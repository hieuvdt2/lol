// Thông số camera theo tỉ lệ khung hình (hàm thuần để kiểm thử).

/** Góc nhìn dọc: 55° cho màn hình ngang/vuông, nới dần tới 78° khi màn hình hẹp (dọc) để không bị "zoom" vào giữa. */
export const viewFov = (aspect: number): number => (!Number.isFinite(aspect) || aspect >= 1 ? 55 : Math.min(78, 55 + (1 - Math.max(0, aspect)) * 42))

/** Hệ số lùi camera: 1 cho màn hình ngang, tăng nhẹ khi màn hình dọc. */
export const viewDistanceScale = (aspect: number): number => (!Number.isFinite(aspect) || aspect >= 1 ? 1 : 1 + (1 - Math.max(0.3, aspect)) * 0.35)

/** Góc nhìn ngang (độ) suy ra từ góc dọc và tỉ lệ khung. */
export const horizontalFov = (verticalFovDeg: number, aspect: number): number => (2 * Math.atan(Math.tan((verticalFovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI
