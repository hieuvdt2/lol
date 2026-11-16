import { DEFAULT_LOOK_CODE, normalizeLookCode } from '../shared/look.mjs'
import type { SavedIdentity } from './types.ts'

const NAME_KEY = 'hangmu.name'
const NUMBER_KEY = 'hangmu.number'
const LOOK_KEY = 'hangmu.look'
const ANALYTICS_KEY = 'hangmu.analytics'

/** Chưa lưu (máy cũ chỉ có tên + số áo) → ngoại hình mặc định. */
const lookFromStorage = (raw: string | null): number => (raw === null || raw.trim() === '' ? DEFAULT_LOOK_CODE : normalizeLookCode(Number(raw)))

export function readIdentity(): SavedIdentity | null {
  const name = localStorage.getItem(NAME_KEY)?.trim() ?? ''
  if (name.length === 0 || [...name].length > 30) return null
  return {
    name,
    number: null, // áo esport không có số: số áo đã lưu từ bản trước bị bỏ qua
    look: lookFromStorage(localStorage.getItem(LOOK_KEY)),
  }
}

export function writeIdentity(identity: SavedIdentity): void {
  localStorage.setItem(NAME_KEY, identity.name)
  localStorage.removeItem(NUMBER_KEY)
  localStorage.setItem(LOOK_KEY, String(normalizeLookCode(identity.look)))
}

export type AnalyticsChoice = 'yes' | 'no' | null

export function readAnalyticsChoice(): AnalyticsChoice {
  const value = localStorage.getItem(ANALYTICS_KEY)
  return value === 'yes' || value === 'no' ? value : null
}

export function writeAnalyticsChoice(choice: 'yes' | 'no'): void {
  localStorage.setItem(ANALYTICS_KEY, choice)
}
