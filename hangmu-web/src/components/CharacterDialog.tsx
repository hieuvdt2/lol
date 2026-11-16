import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { DEFAULT_LOOK, LOOK_LIMITS, decodeLook, encodeLook, randomLook } from '../../shared/look.mjs'
import type { Look } from '../../shared/look.mjs'
import { CARRY_NAMES, FACE_NAMES, HAIR_COLORS, HAIR_COLOR_NAMES, HAIR_STYLE_NAMES, RIDE_NAMES, SKIN_NAMES, SKIN_TONES, TEAM_KITS } from '../game/kits.ts'
import { LCK_TEAMS } from '../game/teams.ts'
import type { SavedIdentity } from '../types.ts'
import { CharacterPreview } from './CharacterPreview.tsx'

const NAME_LIMIT = 30

interface Props {
  initial: SavedIdentity | null
  /** 'create': tạo/đổi nhân vật ở sảnh (tên, ngoại hình) rồi vào hang. 'outfit': đổi trang phục ngay trong hang (tên giữ nguyên). */
  mode?: 'create' | 'outfit'
  onClose: () => void
  onSave: (identity: SavedIdentity) => void
}

/**
 * Tạo nhân vật trước khi vào hang: xem trước 3D bên trái, lựa chọn bên phải (điện thoại: xếp dọc).
 * Chọn đội cổ vũ (màu áo), màu da, kiểu tóc, màu tóc; nút ngẫu nhiên; lựa chọn được nhớ (localStorage + hồ sơ trên server). Áo không có số (như áo esport).
 */
export function CharacterDialog({ initial, mode = 'create', onClose, onSave }: Props) {
  const titleId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [look, setLook] = useState<Look>(() => (initial ? decodeLook(initial.look) : { ...DEFAULT_LOOK }))
  const [cheer, setCheer] = useState(0)
  const outfit = mode === 'outfit'
  const formRef = useRef<HTMLFormElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  // Esc đóng hộp thoại dù tiêu điểm đang ở đâu (mở từ nút trong hang thì tiêu điểm còn ở nút đó); đưa tiêu điểm vào hộp thoại.
  useEffect(() => {
    const first = formRef.current?.querySelector<HTMLElement>('input, button.char-team[aria-pressed="true"]')
    first?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const graphemes = [...name].length
  const canSubmit = name.trim().length > 0 && graphemes <= NAME_LIMIT

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    // Áo esport (Liên Minh) không có số: không còn ô số áo; giữ trường `number` = null cho tương thích giao thức cũ.
    onSave({ name: name.trim(), number: null, look: encodeLook(look) })
  }
  const pick = (part: Partial<Look>) => setLook((current) => ({ ...current, ...part }))

  return (
    <div className="name-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="name-dialog char-dialog plaque"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={formRef}
        onSubmit={submit}
      >
        <h2 id={titleId} className="char-title">{outfit ? 'Đổi trang phục' : initial ? 'Đổi nhân vật' : 'Tạo nhân vật'}</h2>
        <div className="char-stage">
          <CharacterPreview name={name} look={encodeLook(look)} cheer={cheer} />
          <div className="char-stage-actions">
            <button type="button" className="carved-btn carved-btn--ghost char-random" onClick={() => setLook(randomLook())}>
              🎲 Ngẫu nhiên
            </button>
            <button type="button" className="carved-btn carved-btn--ghost char-cheer" onClick={() => setCheer((n) => n + 1)}>
              🎉 Ăn mừng
            </button>
          </div>
        </div>
        <div className="char-fields">
          {outfit ? (
            <p className="char-who">
              <strong>{name}</strong> <span className="name-hint">(đổi tên ở sảnh)</span>
            </p>
          ) : (
            <>
              <label className="name-label" htmlFor={`${titleId}-name`}>
                Tên hiện trên đầu nhân vật (không mạo danh, không phản cảm)
              </label>
              <input
                id={`${titleId}-name`}
                className="name-input"
                value={name}
                maxLength={60}
                autoComplete="nickname"
                spellCheck={false}
                onChange={(event) => setName(event.target.value)}
              />
              <p className={graphemes > NAME_LIMIT ? 'name-count is-over' : 'name-count'} aria-live="polite">
                {graphemes}/{NAME_LIMIT} ký tự
              </p>
            </>
          )}
          <fieldset className="char-group">
            <legend className="name-label">Đội cổ vũ (màu áo)</legend>
            <div className="char-teams">
              {LCK_TEAMS.map((team, index) => {
                const kit = TEAM_KITS[index]!
                return (
                  <button
                    key={team.slug}
                    type="button"
                    className="char-team"
                    aria-pressed={look.team === index}
                    onClick={() => pick({ team: index })}
                  >
                    <span className="char-kit" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${kit.base} 55%, ${kit.accent} 55%)` }} />
                    {team.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <fieldset className="char-group">
            <legend className="name-label">Màu da</legend>
            <div className="char-swatches">
              {SKIN_TONES.slice(0, LOOK_LIMITS.skin).map((color, index) => (
                <button key={color} type="button" className="char-swatch" style={{ background: color }} aria-label={SKIN_NAMES[index]} title={SKIN_NAMES[index]} aria-pressed={look.skin === index} onClick={() => pick({ skin: index })} />
              ))}
            </div>
          </fieldset>
          <fieldset className="char-group">
            <legend className="name-label">Kiểu tóc</legend>
            <div className="char-chips">
              {HAIR_STYLE_NAMES.slice(0, LOOK_LIMITS.hair).map((label, index) => (
                <button key={label} type="button" className="char-chip" aria-pressed={look.hair === index} onClick={() => pick({ hair: index })}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="char-group">
            <legend className="name-label">Màu tóc</legend>
            <div className="char-swatches">
              {HAIR_COLORS.slice(0, LOOK_LIMITS.hairColor).map((color, index) => (
                <button key={color} type="button" className="char-swatch" style={{ background: color }} aria-label={HAIR_COLOR_NAMES[index]} title={HAIR_COLOR_NAMES[index]} aria-pressed={look.hairColor === index} onClick={() => pick({ hairColor: index })} />
              ))}
            </div>
          </fieldset>
          <fieldset className="char-group">
            <legend className="name-label">Phụ kiện</legend>
            <ChipRow label="Trên mặt" names={FACE_NAMES} value={look.face} onPick={(face) => pick({ face })} />
            <ChipRow label="Mang theo" names={CARRY_NAMES} value={look.carry} onPick={(carry) => pick({ carry })} />
            <ChipRow label="Di chuyển" names={RIDE_NAMES} value={look.ride} onPick={(ride) => pick({ ride })} />
          </fieldset>
        </div>
        <div className="name-actions">
          <button type="button" className="name-cancel carved-btn carved-btn--ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className="home-enter carved-btn carved-btn--primary" disabled={!canSubmit}>
            {outfit ? 'Lưu trang phục' : 'Vào hang'}
          </button>
        </div>
      </form>
    </div>
  )
}


function ChipRow({ label, names, value, onPick }: { label: string; names: readonly string[]; value: number; onPick: (index: number) => void }) {
  return (
    <div className="char-chips char-acc" role="group" aria-label={label}>
      <span className="char-acc-label">{label}</span>
      {names.map((name, index) => (
        <button key={name} type="button" className="char-chip" aria-pressed={value === index} onClick={() => onPick(index)}>
          {name}
        </button>
      ))}
    </div>
  )
}
