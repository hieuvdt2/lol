interface ConsentBannerProps {
  onChoose: (choice: 'yes' | 'no') => void
  onDetails: () => void
}

export function ConsentBanner({ onChoose, onDetails }: ConsentBannerProps) {
  return (
    <aside className="consent-banner" role="region" aria-label="Đồng ý cookie">
      <p>
        Hang Tê Đỏ muốn dùng cookie Google Analytics để đếm lượt truy cập (không quảng cáo).{' '}
        <button type="button" className="consent-link" onClick={onDetails}>
          Chi tiết
        </button>
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-no" onClick={() => onChoose('no')}>
          Từ chối
        </button>
        <button type="button" className="consent-yes" onClick={() => onChoose('yes')}>
          Đồng ý
        </button>
      </div>
    </aside>
  )
}
