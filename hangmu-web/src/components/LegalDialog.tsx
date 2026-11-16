import { useId } from 'react'
import { TELEGRAM_URL, legalSections } from '../content/legal.ts'

interface LegalDialogProps {
  onClose: () => void
}

export function LegalDialog({ onClose }: LegalDialogProps) {
  const titleId = useId()

  return (
    <div className="legal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <header className="legal-head">
          <h2 id={titleId}>Điều khoản & Quyền riêng tư</h2>
          <button type="button" className="legal-close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>
        <div className="legal-body">
          {legalSections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
          <h3>Liên hệ</h3>
          <p>
            Góp ý hoặc báo vi phạm trên site gốc:{' '}
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
              group Telegram Hang MU
            </a>
            .
          </p>
          <p className="legal-updated">Bản React này chỉ mô tả những gì đã quan sát trên sảnh.</p>
        </div>
      </section>
    </div>
  )
}
