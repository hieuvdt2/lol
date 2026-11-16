interface DonateProps {
  open: boolean
  onToggle: () => void
  /** Lớp định vị: mặc định góc sảnh; trong hang dùng "hang-donate". */
  className?: string
}

export function Donate({ open, onToggle, className = 'home-donate' }: DonateProps) {
  return (
    <div className={`donate ${className}`}>
      {open ? (
        <div className="donate-card">
          <p className="donate-title">Góp vào sơ vơ</p>
          <img className="donate-qr" src="/images/donate-qr.png" alt="Mã chuyển khoản ủng hộ máy chủ" />
          <p className="donate-note">Quét bằng app ngân hàng bất kỳ</p>
          <p className="donate-note">Ủng hộ tự nguyện để trả tiền máy chủ · không hoàn lại · không phải quyên góp từ thiện</p>
        </div>
      ) : null}
      <button
        type="button"
        className="donate-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        ☕ Ủng hộ
      </button>
    </div>
  )
}
