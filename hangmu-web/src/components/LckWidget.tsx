import { useState } from 'react'
import { HOME_TEAM } from '../game/lckBoard.ts'
import { LCK_TEAMS } from '../game/teams.ts'

const home = LCK_TEAMS.find((t) => t.name === HOME_TEAM)

/**
 * Widget LCK trong hang: chip gọn "LCK · T1 · hạng 3", bấm mở bảng xếp hạng 10 đội kèm vé quốc tế.
 * Số liệu nhập tay trong teams.ts (không có nguồn trực tiếp), nên chỉ là thông tin tham khảo.
 */
export function LckWidget() {
  const [open, setOpen] = useState(false)
  if (!home) return null
  return (
    <section className="plaque hang-lck" aria-label="Bảng xếp hạng LCK">
      <button type="button" className="hang-lck-chip" aria-expanded={open} aria-label={`LCK: ${home.name} hạng ${home.rank}. Bấm để xem bảng xếp hạng`} onClick={() => setOpen((v) => !v)}>
        <span className="hang-lck-team">LCK</span>
        <strong className="hang-lck-score">{home.name}</strong>
        <span className="hang-lck-status">hạng {home.rank}</span>
      </button>
      {open ? (
        <div className="hang-lck-details">
          <table className="hang-lck-table" aria-label="Bảng xếp hạng LCK 2026">
            <caption>Bảng xếp hạng LCK 2026</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Đội</th>
                <th scope="col">Vé quốc tế</th>
              </tr>
            </thead>
            <tbody>
              {LCK_TEAMS.map((t) => (
                <tr key={t.slug} data-us={t.name === HOME_TEAM || undefined} data-ticket={t.ticket === 'Không có' ? 'none' : t.ticket === 'CKTG 2026' ? 'worlds' : 'dcgi'} title={t.note}>
                  <td>{t.rank}</td>
                  <th scope="row">{t.name}</th>
                  <td>{t.ticket === 'Không có' ? '—' : t.ticket}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hang-lck-note">Số liệu nhập tay, không phải dữ liệu trực tiếp. Rê chuột vào dòng để xem thành tích.</p>
        </div>
      ) : null}
    </section>
  )
}
