import type { LegalSection } from '../types.ts'

export const legalSections: LegalSection[] = [
  {
    title: 'Trang của người hâm mộ',
    paragraphs: [
      'Hang Tê Đỏ là sân chơi phi lợi nhuận do fan tự làm, không liên kết, không được tài trợ hay chứng thực bởi T1, Riot Games hay bất kỳ giải đấu nào. Tên và logo của đội, nhà phát hành và giải đấu thuộc về chủ sở hữu.',
    ],
  },
  {
    title: 'Độ tuổi',
    items: [
      'Hang Tê Đỏ dành cho người từ 16 tuổi. Dưới 16 tuổi chỉ dùng khi cha mẹ hoặc người giám hộ biết và đồng ý.',
      'Hội trường đá, nơi nói bằng giọng, chỉ dành cho người từ 16 tuổi.',
    ],
  },
  {
    title: 'Chat, giọng nói và hành vi',
    paragraphs: ['Bạn tự chịu trách nhiệm về tên, tin nhắn và lời nói của mình.'],
    items: [
      'Không xúc phạm, phân biệt, quấy rối, spam hay quảng cáo.',
      'Không đưa thông tin cá nhân của người khác khi họ chưa đồng ý.',
      'Tin nhắn trên bản local này không được gửi đi.',
    ],
  },
  {
    title: 'Dữ liệu bản local',
    items: [
      'Số người trong hang là bản ghi lúc clone, không phải số đang sống trên hangmu.online.',
      'Tên và trang phục chỉ lưu trong trình duyệt của máy này.',
      'Cookie phân tích không được tải. Nút đồng ý chỉ ghi lựa chọn trên máy.',
    ],
  },
  {
    title: 'Ủng hộ',
    paragraphs: [
      'Tiền ủng hộ trên site gốc là tự nguyện, dùng để trả máy chủ, không hoàn lại và không đổi lấy quyền lợi trong hang.',
    ],
  },
]

export const TELEGRAM_URL = 'https://t.me/hangmu_online'
