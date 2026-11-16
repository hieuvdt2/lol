import { useEffect, useRef, useState } from 'react'
import { answerQuiz, getQuiz } from '../api.ts'
import type { QuizQuestion, QuizResult } from '../api.ts'
import { giveBack, nextQuestion, resultLine } from '../game/quiz.ts'

interface QuizGateProps {
  /** Vào hang (sau khi xem kết quả, hoặc ngay khi server không có/không trả lời được quiz). */
  onPass: () => void
  onCancel: () => void
}

type State =
  | { step: 'loading' }
  | { step: 'asking'; q: QuizQuestion; chosen?: string }
  | { step: 'result'; q: QuizQuestion; chosen: string; res: QuizResult; message: string }

/**
 * Câu hỏi vui trước khi vào hang. Giống bản gốc: trả lời đúng hay sai đều được vào; đáp án đúng tô xanh;
 * quiz lỗi (mạng, server) thì bỏ qua và vào hang luôn.
 */
export function QuizGate({ onPass, onCancel }: QuizGateProps) {
  const [state, setState] = useState<State>({ step: 'loading' })
  const dialog = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const passRef = useRef(onPass)
  const cancelRef = useRef(onCancel)
  useEffect(() => {
    passRef.current = onPass
    cancelRef.current = onCancel
  })

  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    nextQuestion(() => getQuiz(controller.signal))
      .then((q) => {
        if (controller.signal.aborted) {
          if (q) giveBack(q)
          return
        }
        if (q) setState({ step: 'asking', q })
        else passRef.current()
      })
      .catch(() => {
        if (!controller.signal.aborted) passRef.current()
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const target = state.step === 'result' ? el.querySelector<HTMLElement>('.home-enter') : el.querySelector<HTMLElement>('.quiz-answer:not(:disabled)')
    ;(target ?? el).focus()
  }, [state.step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const choose = async (q: QuizQuestion, answerId: string) => {
    const controller = abort.current
    if (!controller) return
    setState({ step: 'asking', q, chosen: answerId })
    try {
      const res = await answerQuiz(q.id, answerId, controller.signal)
      if (controller.signal.aborted) return
      setState({ step: 'result', q, chosen: answerId, res, message: resultLine(res.correct) })
    } catch {
      if (!controller.signal.aborted) passRef.current()
    }
  }

  const answerClass = (id: string) => {
    if (state.step === 'loading') return 'quiz-answer'
    if (state.step === 'asking') return `quiz-answer${state.chosen === id ? ' is-chosen' : ''}`
    if (id === state.res.correctAnswerId) return 'quiz-answer is-right'
    return `quiz-answer${id === state.chosen ? ' is-wrong' : ''}`
  }

  return (
    <div className="name-backdrop" onMouseDown={(event) => event.target === event.currentTarget && state.step !== 'result' && onCancel()}>
      <div ref={dialog} className="name-dialog quiz-dialog plaque" role="dialog" aria-modal="true" aria-labelledby="quiz-title" aria-busy={state.step === 'loading'} tabIndex={-1}>
        <p className="quiz-kicker">Câu hỏi vui trước khi vào hang</p>
        {state.step === 'loading' ? (
          <h2 id="quiz-title">Đang gõ cửa hang…</h2>
        ) : (
          <>
            <h2 id="quiz-title">{state.q.q}</h2>
            <div className="quiz-answers">
              {state.q.answers.map((answer) => (
                <button key={answer.id} type="button" className={answerClass(answer.id)} disabled={state.step === 'asking' && state.chosen !== undefined ? true : state.step === 'result'} onClick={() => void choose(state.q, answer.id)}>
                  {answer.text}
                </button>
              ))}
            </div>
          </>
        )}
        {state.step === 'result' ? (
          <>
            <p className={state.res.correct ? 'quiz-result' : 'quiz-result is-wrong'}>{state.message}</p>
            <button type="button" className="home-enter carved-btn carved-btn--primary" onClick={onPass}>
              Vào hang
            </button>
          </>
        ) : (
          <button type="button" className="name-cancel carved-btn carved-btn--ghost" onClick={onCancel}>
            Ở lại sảnh
          </button>
        )}
      </div>
    </div>
  )
}
