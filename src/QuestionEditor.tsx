import { useEffect, useRef, useState } from 'react'
import { AI_NAMES } from '../server/game.ts'
import { t, tError } from './i18n.ts'
import { admin, type View } from './socket.ts'
import { Icon } from './ui.tsx'

/** Was der Dialog bearbeitet. original = bisheriger Text (fehlt bei einer neuen Frage), saved = steht schon in der Sammlung. */
export type QuestionDraft = { original?: string; q: string; ai: string[]; saved?: boolean }

const SLOTS = [0, 1, 2] // höchstens drei KIs spielen mit

/** Dialog zum Anlegen und Bearbeiten einer eigenen Frage samt Ersatzantworten für die KI. */
export function QuestionEditor({ view, draft, onClose }: { view: View; draft: QuestionDraft; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState(draft.q)
  const [ai, setAi] = useState(() => SLOTS.map(i => draft.ai[i] ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  const { settings, plan } = view.admin!
  // So viele Felder wie KIs mitspielen (oder schon ausgefüllt sind), weitere nur auf Wunsch
  const [shown, setShown] = useState(Math.max(1, settings.ais.length, draft.ai.length))
  const inPlan = plan.some(p => p.q === draft.original)
  const dirty = q !== draft.q || ai.some((a, i) => a !== (draft.ai[i] ?? ''))
  // Jede KI ohne Key braucht eine Ersatzantwort. Welche sie bekommt, entscheidet der Zufall
  const filled = ai.filter(a => a.trim()).length
  const keyless = settings.ais.filter(p => view.keys && !view.keys[p]).map(p => AI_NAMES[p])

  const save = async (toPlan: boolean) => {
    setBusy(true)
    const r = await admin('question.save', { original: draft.original, question: q, ai, plan: toPlan })
    setBusy(false)
    if (r.error) setError(tError(r.error))
    else onClose()
  }
  const remove = async () => {
    if (!confirm(t('own.deleteConfirm'))) return
    await admin('question.delete', { question: draft.original })
    onClose()
  }

  return (
    <dialog ref={dialog} aria-labelledby="question-editor-title" onClose={onClose}
      onCancel={e => {
        if (dirty && !confirm(t('own.discard'))) e.preventDefault() // Esc soll Getipptes nicht kommentarlos wegwerfen
      }}
      className="frame m-auto max-h-[calc(100dvh-1.5rem)] w-[min(600px,calc(100vw-1.5rem))] overflow-y-auto p-0 text-ink backdrop:bg-[#000064]/70">
      <form className="flex flex-col gap-4 p-5" onSubmit={e => {
        e.preventDefault()
        save(false)
      }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="question-editor-title" className="display m-0 text-3xl">{t(draft.original ? 'own.dialogEdit' : 'own.dialogNew')}</h2>
          <button type="button" className="btn size-10 min-h-10 px-0" aria-label={t('own.cancel')} onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="label flex justify-between text-ink"><span>{t('own.question')}</span><span className="tabular-nums">{q.length} / 200</span></span>
          <textarea className="field resize-none font-[inherit]" rows={2} maxLength={200} required autoFocus value={q}
            placeholder={t('own.questionPlaceholder')} onChange={e => setQ(e.target.value)} />
        </label>

        <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend className="label mb-2 p-0 text-ink">{t('own.answersTitle')}</legend>
          <p className="m-0 text-sm text-muted">{t('own.answersHint')}</p>
          {SLOTS.slice(0, shown).map(i => (
            <label key={i} className="flex flex-col gap-1.5">
              <span className="label flex justify-between gap-3">
                <span>{t('own.answer', { n: i + 1 })}</span>
                <span className="shrink-0 tabular-nums">{ai[i].length} / {view.maxChars}</span>
              </span>
              <textarea className="field resize-none font-[inherit] text-base" rows={2} maxLength={view.maxChars} value={ai[i]}
                onChange={e => setAi(ai.map((a, k) => (k === i ? e.target.value : a)))} />
            </label>
          ))}
          {shown < SLOTS.length && (
            <button type="button" className="btn min-h-10 self-start px-3 text-sm" onClick={() => setShown(shown + 1)}><Icon name="plus" size={16} />{t('own.addAnswer')}</button>
          )}
        </fieldset>

        {filled < keyless.length && (
          <p role="status" className="m-0 text-sm font-bold text-ai-text">{t('own.missing', { names: keyless.join(', '), have: filled, need: keyless.length })}</p>
        )}
        {error && <p role="alert" className="m-0 font-bold text-ai-text">{error}</p>}

        {/* Handy: Speichern oben, Löschen ganz unten. Ab sm eine Zeile mit Löschen links */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {draft.saved && <button type="button" className="btn sm:mr-auto" disabled={busy} onClick={remove}>{t('own.delete')}</button>}
          {!inPlan && <button type="button" className="btn" disabled={busy || !q.trim()} onClick={() => save(true)}>{t('own.saveAndPlan')}</button>}
          <button className="btn btn-primary min-h-12 text-base" disabled={busy || !q.trim()}>{t('own.save')}</button>
        </div>
      </form>
    </dialog>
  )
}
