export const TRAP: Readonly<{ rows: number; cols: number; mushrooms: number; lives: number; maxPerRow: number; placeMs: number; turnMs: number; revealMs: number }>
export function cellOf(row: number, col: number): number
export function rowOf(cell: number): number
export function colOf(cell: number): number
export function validPlacement(cells: unknown): boolean
export function completePlacement(partial: unknown, random?: () => number): number[]
export interface TrapMatch {
  players: [number, number]
  phase: 'place' | 'walk' | 'ended'
  round: number
  board: Record<number, number[] | null>
  row: Record<number, number>
  lives: Record<number, number>
  hit: Record<number, number[]>
  path: Record<number, number[]>
  pick: Record<number, number | null>
}
export interface TrapStep { p: number; row: number; col: number; hit: boolean }
export interface TrapOutcome { winner: number | null; reason: 'goal' | 'dead' | 'draw' }
export function createMatch(a: number, b: number): TrapMatch
export function foeOf(m: TrapMatch, p: number): number
export function place(m: TrapMatch, by: number, cells: number[]): boolean
export function startWalk(m: TrapMatch, random?: () => number): boolean
export function openCols(m: TrapMatch, p: number): number[]
export function pick(m: TrapMatch, p: number, col: number): boolean
export function bothPicked(m: TrapMatch): boolean
export function resolveRound(m: TrapMatch, random?: () => number): { steps: TrapStep[]; outcome: TrapOutcome | null } | null
export function judge(m: TrapMatch): TrapOutcome | null
