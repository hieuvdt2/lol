// Câu hỏi cửa hang: server giữ đáp án và chấm; client chỉ nhận câu hỏi + các lựa chọn (không có đáp án đúng).
// Nội dung câu hỏi do bản dựng lại tự viết (bản gốc có ngân hàng câu hỏi riêng trên server, không nằm trong capture).
// Chủ đề esport (Liên Minh Huyền Thoại, LCK, T1). Viết từ kiến thức sẵn có, CHƯA kiểm chứng trực tuyến: chủ dự án nên đọc lại trước khi dùng thật.
// Chỉ dùng sự kiện ổn định; muốn thêm câu hãy giữ nguyên `id` cũ để client đang mở không bị lệch.

/** @type {Array<{ id: string, q: string, answers: Array<{ id: string, text: string }>, correct: string }>} */
export const QUESTIONS = [
  { id: 'riot', q: 'Hãng nào phát triển trò chơi Liên Minh Huyền Thoại (League of Legends)?', correct: 'a',
    answers: [{ id: 'a', text: 'Riot Games' }, { id: 'b', text: 'Valve' }, { id: 'c', text: 'Blizzard' }, { id: 'd', text: 'Garena' }] },
  { id: 'lck', q: 'LCK là viết tắt của giải đấu nào?', correct: 'c',
    answers: [{ id: 'a', text: 'League of Legends Championship Korea' }, { id: 'b', text: 'Legends Cup Korea' }, { id: 'c', text: 'League of Legends Champions Korea' }, { id: 'd', text: 'Legend Champions Knockout' }] },
  { id: 'win', q: 'Trong một ván Liên Minh Huyền Thoại, đội thắng khi làm gì?', correct: 'b',
    answers: [{ id: 'a', text: 'Hạ gục đủ 50 mạng của địch' }, { id: 'b', text: 'Phá hủy Nhà chính (Nexus) của đối phương' }, { id: 'c', text: 'Giữ nhiều vàng nhất sau 30 phút' }, { id: 'd', text: 'Giết Baron Nashor ba lần' }] },
  { id: 'team-size', q: 'Mỗi đội thi đấu một ván Liên Minh Huyền Thoại chính thức có bao nhiêu tuyển thủ trên sân?', correct: 'c',
    answers: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }, { id: 'd', text: '6' }] },
  { id: 'faker', q: 'Tuyển thủ Faker nổi tiếng với vị trí nào?', correct: 'd',
    answers: [{ id: 'a', text: 'Đường trên (Top)' }, { id: 'b', text: 'Đi rừng (Jungle)' }, { id: 'c', text: 'Xạ thủ (ADC)' }, { id: 'd', text: 'Đường giữa (Mid)' }] },
  { id: 'skt', q: 'Trước khi mang tên T1, đội có tên là gì?', correct: 'a',
    answers: [{ id: 'a', text: 'SK Telecom T1' }, { id: 'b', text: 'Samsung Galaxy' }, { id: 'c', text: 'KT Rolster' }, { id: 'd', text: 'KOO Tigers' }] },
  { id: 'worlds-2013', q: 'Đội nào vô địch Chung kết Thế giới Liên Minh Huyền Thoại 2013?', correct: 'b',
    answers: [{ id: 'a', text: 'Royal Club' }, { id: 'b', text: 'SK Telecom T1' }, { id: 'c', text: 'Fnatic' }, { id: 'd', text: 'Cloud9' }] },
  { id: 'worlds-2023', q: 'Chung kết Thế giới 2023, T1 vô địch, diễn ra ở thành phố nào?', correct: 'd',
    answers: [{ id: 'a', text: 'Busan' }, { id: 'b', text: 'Incheon' }, { id: 'c', text: 'Daegu' }, { id: 'd', text: 'Seoul' }] },
  { id: 'worlds-2024', q: 'Chung kết Thế giới 2024 diễn ra ở thành phố nào?', correct: 'a',
    answers: [{ id: 'a', text: 'London' }, { id: 'b', text: 'Paris' }, { id: 'c', text: 'Berlin' }, { id: 'd', text: 'New York' }] },
  { id: 'cup', q: 'Chiếc cúp dành cho đội vô địch thế giới Liên Minh Huyền Thoại tên là gì?', correct: 'c',
    answers: [{ id: 'a', text: 'Cúp Nexus' }, { id: 'b', text: 'Cúp Baron' }, { id: 'c', text: 'Cúp Triệu Hồi Sư (Summoner\'s Cup)' }, { id: 'd', text: 'Cúp Huyền Thoại' }] },
  { id: 'map', q: 'Bản đồ thi đấu chuyên nghiệp của Liên Minh Huyền Thoại tên là gì?', correct: 'b',
    answers: [{ id: 'a', text: 'Howling Abyss' }, { id: 'b', text: 'Summoner\'s Rift' }, { id: 'c', text: 'Twisted Treeline' }, { id: 'd', text: 'Crystal Scar' }] },
  { id: 'baron', q: 'Quái vật mạnh nhất trên Summoner\'s Rift, hạ được sẽ nhận buff giúp đẩy trụ, tên là gì?', correct: 'd',
    answers: [{ id: 'a', text: 'Rift Herald' }, { id: 'b', text: 'Cloud Drake' }, { id: 'c', text: 'Crimson Raptor' }, { id: 'd', text: 'Baron Nashor' }] },
  { id: 'release', q: 'Liên Minh Huyền Thoại ra mắt chính thức vào năm nào?', correct: 'b',
    answers: [{ id: 'a', text: '2007' }, { id: 'b', text: '2009' }, { id: 'c', text: '2011' }, { id: 'd', text: '2013' }] },
  { id: 'no-keeper', q: 'Vị trí nào KHÔNG có trong đội hình Liên Minh Huyền Thoại?', correct: 'c',
    answers: [{ id: 'a', text: 'Đi rừng (Jungle)' }, { id: 'b', text: 'Hỗ trợ (Support)' }, { id: 'c', text: 'Thủ môn (Goalkeeper)' }, { id: 'd', text: 'Đường trên (Top)' }] },
]

const byId = new Map(QUESTIONS.map((q) => [q.id, q]))

/** Danh sách câu hỏi gửi cho client (không có đáp án đúng). */
export function publicQuestions() {
  return QUESTIONS.map(({ id, q, answers }) => ({ id, q, answers: answers.map((a) => ({ ...a })) }))
}

/** Chấm một đáp án. Câu hỏi hoặc đáp án không tồn tại → null (client coi là lỗi, vào hang luôn). */
export function gradeAnswer(questionId, answerId) {
  if (typeof questionId !== 'string' || typeof answerId !== 'string') return null
  const question = byId.get(questionId)
  if (!question || !question.answers.some((a) => a.id === answerId)) return null
  return { correct: question.correct === answerId, correctAnswerId: question.correct }
}
