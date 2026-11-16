export interface Look { team: number; skin: number; hair: number; hairColor: number; face: number; carry: number; ride: number }
export const LOOK_TEAMS: string[]
export const LOOK_LIMITS: { team: number; skin: number; hair: number; hairColor: number; face: number; carry: number; ride: number }
export const DEFAULT_LOOK: Readonly<Look>
export const DEFAULT_LOOK_CODE: number
export function isLook(look: unknown): look is Look
export function encodeLook(look: Look): number
export function decodeLook(code: unknown): Look
export function normalizeLookCode(code: unknown): number
export function randomLook(random?: () => number): Look
