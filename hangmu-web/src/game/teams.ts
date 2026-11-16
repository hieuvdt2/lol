// Danh sách các đội LCK hiện trên biểu ngữ trong đấu trường (số liệu do chủ dự án cung cấp ngày 2026-11-12; tôi chưa tự kiểm chứng).
export interface LckTeam {
  rank: number
  name: string
  /** Tên tệp logo (không đuôi) trong public/teams/. Thiếu thì biểu ngữ vẽ huy hiệu chữ cái tự tạo. */
  slug: string
  /** Chữ cái trên huy hiệu tự tạo khi chưa có logo. */
  initials: string
  /** Vé tham dự giải quốc tế. */
  ticket: string
  /** Thành tích nổi bật khác trong mùa giải. */
  note: string
}

export const LCK_TEAMS: readonly LckTeam[] = [
  { rank: 1, name: 'Gen.G', slug: 'geng', initials: 'GG', ticket: 'CKTG 2026', note: 'Vô địch LCK Cup 2026, dự First Stand 2026.' },
  { rank: 2, name: 'Hanwha Life Esports', slug: 'hle', initials: 'HLE', ticket: 'CKTG 2026', note: 'Hạt giống số 1 LCK dự MSI 2026 (hạng nhất vòng 1–2).' },
  { rank: 3, name: 'T1', slug: 't1', initials: 'T1', ticket: 'CKTG 2026', note: 'Hạt giống số 2 LCK dự MSI 2026.' },
  { rank: 4, name: 'Dplus KIA', slug: 'dk', initials: 'DK', ticket: 'CKTG 2026', note: 'Đứng đầu bảng Legend ở giai đoạn đầu vòng 3–4.' },
  { rank: 5, name: 'KT Rolster', slug: 'kt', initials: 'KT', ticket: 'DCGI 2026', note: 'Góp mặt trong nhóm Legend Group giai đoạn 2.' },
  { rank: 6, name: 'BNK FEARX', slug: 'bnk', initials: 'BNK', ticket: 'DCGI 2026', note: 'Á quân LCK Cup 2026, dự First Stand 2026.' },
  { rank: 7, name: 'Hanjin BRION', slug: 'brion', initials: 'HJB', ticket: 'DCGI 2026', note: 'Dẫn đầu nhóm Rise Group tại vòng 3–4.' },
  { rank: 8, name: 'NS RedForce', slug: 'ns', initials: 'NS', ticket: 'Không có', note: 'Dừng bước sau vòng bảng Rise Group.' },
  { rank: 9, name: 'Kiwoom DRX', slug: 'drx', initials: 'DRX', ticket: 'Không có', note: 'Dừng bước sau vòng bảng Rise Group.' },
  { rank: 10, name: 'DN SOOPers', slug: 'soopers', initials: 'DN', ticket: 'Không có', note: 'Xếp cuối bảng chung cuộc.' },
]

/** Những logo đã có trong public/teams/ (tải từ Wikimedia Commons, xem CREDITS.md). Thêm tệp mới thì thêm slug vào đây. */
export const LOGO_FILES: ReadonlySet<string> = new Set(['geng', 'hle', 't1', 'dk'])

/** Chia chữ thành các dòng không vượt `maxWidth` theo hàm đo độ rộng (cắt theo từ). */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}
