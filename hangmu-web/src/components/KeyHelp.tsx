const KEYS: Array<[string, string]> = [
  ['W A S D / ↑ ← ↓ →', 'Đi lại (theo hướng nhìn)'],
  ['Chuột', 'Xoay góc nhìn (bấm vào cảnh để khoá chuột, Esc để nhả)'],
  ['Chuột trái (đang khoá)', 'Đấm người ở gần'],
  ['F', 'Đấm'],
  ['E', 'Ngồi / đứng dậy (gần ghế)'],
  ['V / R / B', 'Mời người ở gần: võ thuật / chat riêng / Bẫy Độc Noxus (trong trận: 1–2 chọn ô)'],
  ['Y / N', 'Đồng ý / từ chối lời mời'],
  ['T', 'Mở bảng ném đồ (← → đổi hình nộm)'],
  ['G', 'Ăn mừng'],
  ['Enter', 'Nhắn tin trong hang'],
  ['1 – 6', 'Chat nhanh: gửi câu có sẵn (danh sách ở nút ⚡ cạnh ô chat)'],
  ['H', 'Bảng phím này'],
  ['Esc', 'Nhả chuột / thoát hang'],
]

/** Bảng phím tắt (phím H). */
export function KeyHelp({ onClose }: { onClose: () => void }) {
  return (
    <section className="plaque hang-keys" role="dialog" aria-label="Phím tắt">
      <header>
        <strong>Phím</strong>
        <button type="button" className="carved-btn carved-btn--ghost" onClick={onClose}>Đóng</button>
      </header>
      <dl>
        {KEYS.map(([key, what]) => (
          <div key={key}>
            <dt><kbd>{key}</kbd></dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
