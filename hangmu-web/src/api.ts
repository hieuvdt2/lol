import { normalizeLookCode } from '../shared/look.mjs'
import type { RoomStatus, SavedIdentity } from './types.ts'

export async function getRoomStatus(signal: AbortSignal): Promise<RoomStatus | null> {
  const response = await fetch('/api/room/status', {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (!isRoomStatus(body)) return null
  return body
}

function isRoomStatus(value: unknown): value is RoomStatus {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.inRoom === 'number' &&
    typeof record.capacity === 'number' &&
    typeof record.waiting === 'number'
  )
}

const toIdentity = (value: unknown): SavedIdentity | null => {
  if (typeof value !== 'object' || value === null) return null
  const { name, number, look } = value as Record<string, unknown>
  if (typeof name !== 'string' || name.length === 0) return null
  void number // hồ sơ cũ có thể còn số áo: bỏ qua (áo esport không có số)
  return { name, number: null, look: normalizeLookCode(look) }
}

/** Hồ sơ đã lưu trên server cho cookie hiện tại (null nếu chưa có hoặc server không trả lời kịp). */
export async function getMe(signal?: AbortSignal): Promise<SavedIdentity | null> {
  try {
    const response = await fetch('/api/me', { signal: signal ?? AbortSignal.timeout(4000), headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    return response.ok ? toIdentity(await response.json()) : null
  } catch {
    return null
  }
}

/** Lưu hồ sơ lên server; trả về hồ sơ server đã chuẩn hoá. Lỗi thì ném Error có thông điệp hiển thị được. */
export async function saveMe(identity: SavedIdentity, signal?: AbortSignal): Promise<SavedIdentity> {
  const response = await fetch('/api/me', {
    method: 'POST',
    signal: signal ?? AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(identity),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `HTTP ${response.status}`
    throw new Error(message)
  }
  const saved = toIdentity(body)
  if (!saved) throw new Error('Phản hồi không hợp lệ')
  return saved
}

export interface QuizChoice {
  id: string
  text: string
}
export interface QuizQuestion {
  id: string
  q: string
  answers: QuizChoice[]
}
export interface QuizResult {
  correct: boolean
  correctAnswerId: string
}

const isQuestion = (value: unknown): value is QuizQuestion => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.q === 'string' && Array.isArray(v.answers) && v.answers.length >= 2 && v.answers.every((a) => typeof a === 'object' && a !== null && typeof (a as QuizChoice).id === 'string' && typeof (a as QuizChoice).text === 'string')
}

/** Ngân hàng câu hỏi từ server (không kèm đáp án). Lỗi thì ném ra để màn hình quiz bỏ qua và vào hang luôn. */
export async function getQuiz(signal: AbortSignal): Promise<QuizQuestion[]> {
  const response = await fetch('/api/quiz', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body: unknown = await response.json()
  const list = typeof body === 'object' && body !== null ? (body as { questions?: unknown }).questions : null
  if (!Array.isArray(list)) throw new Error('Phản hồi không hợp lệ')
  return list.filter(isQuestion)
}

/** Nhờ server chấm một đáp án. */
export async function answerQuiz(questionId: string, answerId: string, signal: AbortSignal): Promise<QuizResult> {
  const response = await fetch('/api/quiz/answer', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ questionId, answerId }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as Partial<QuizResult> | null
  if (typeof body?.correct !== 'boolean' || typeof body.correctAnswerId !== 'string') throw new Error('Phản hồi không hợp lệ')
  return { correct: body.correct, correctAnswerId: body.correctAnswerId }
}
