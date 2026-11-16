// Lời nhắn sau khi trả lời quiz (câu hỏi và đáp án nằm trên server: xem server/lib/quiz.mjs).
import type { QuizQuestion } from '../api.ts'

const passLines = [
  'Chuẩn fan Tê Đỏ! Mời vào hang.',
  'Chính xác! Đúng chất fan cứng.',
  'Đúng rồi! Tê Đỏ muôn năm!',
]
const failLines = [
  'Trượt mất rồi! Không sao, vào hang anh em kể thêm cho.',
  'Sai một chút thôi, hang vẫn mở cửa chào bạn.',
  'Trượt rồi, như lỡ nhịp giao tranh! Đáp án đúng tô xanh đó.',
]

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)] ?? list[0]!

export const resultLine = (correct: boolean): string => pick(correct ? passLines : failLines)

export function shuffle<T>(list: readonly T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

let pool: QuizQuestion[] = []

/** Rút một câu (xáo trộn đáp án); hết thì nạp lại bằng `load`. Trả null nếu server không có câu nào. */
export async function nextQuestion(load: () => Promise<QuizQuestion[]>): Promise<QuizQuestion | null> {
  if (pool.length === 0) pool = shuffle(await load())
  const q = pool.pop()
  return q ? { ...q, answers: shuffle(q.answers) } : null
}

/** Trả câu chưa dùng về túi (khi người dùng huỷ trước khi trả lời). */
export function giveBack(question: QuizQuestion): void {
  pool.push(question)
}
