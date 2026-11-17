import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AI_NAMES, OWN_TOPIC, type Provider, type Settings } from '../server/game.ts'
import { Avatar, PersonAvatar } from './Avatar.tsx'
import { t, tError, tn, type Key } from './i18n.ts'
import { QuestionEditor, type QuestionDraft } from './QuestionEditor.tsx'
import { admin, useGame, type View } from './socket.ts'
import { Icon, JoinForm, Loading, Phone, SPRING, buzz, clock, rankOf, secondsLeft, timerClass, useNow } from './ui.tsx'

type Act = (type: string, args?: Record<string, unknown>) => Promise<void>
type Tab = 'round' | 'questions' | 'people' | 'game'

export default function Admin() {
  const { view, status, online, enter, logout } = useGame('admin')
  const [tab, setTab] = useState<Tab>('round')
  const [error, setError] = useState('')
  if (status === 'join') return <Phone online={online}><JoinForm role="admin" onSubmit={enter} /></Phone>
  if (!view?.admin) return <Phone online={online}><Loading /></Phone>
  const act: Act = async (type, args) => {
    const r = await admin(type, args)
    setError(r.error ? tError(r.error) : '')
  }
  const tabs: [Tab, string][] = [
    ['round', t('admin.tabRound')],
    ['questions', t('admin.tabQuestions', { n: view.admin.plan.length })],
    ['people', t('admin.tabPeople', { n: view.admin.people.length })],
    ['game', t('admin.tabGame')],
  ]
  return (
    <Phone online={online} wide menu={<AdminMenu logout={logout} />}>
      <nav role="tablist" className="frame grid grid-cols-4 overflow-hidden p-0 lg:max-w-2xl">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`label relative min-h-11 border-0 bg-transparent px-1 transition-colors duration-200 ${tab === id ? 'text-on-strong' : 'text-ink'}`}>
            {tab === id && <motion.span layoutId="admin-tab" transition={SPRING} className="absolute inset-1 rounded-[calc(var(--r)*.6)] bg-strong" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </nav>
      {error && <p role="alert" className="m-0 font-bold text-ai-text">{error}</p>}
      {tab === 'round' && <RoundTab view={view} act={act} />}
      {tab === 'questions' && <QuestionsTab view={view} act={act} />}
      {tab === 'people' && <PeopleTab view={view} act={act} />}
      {tab === 'game' && <GameTab view={view} act={act} />}
    </Phone>
  )
}

/** Konto-Menü oben rechts: klappt über der Seite auf, schließt bei Klick daneben oder Esc. */
function AdminMenu({ logout }: { logout: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen(!open)}
        className="chip cursor-pointer bg-card py-1 pr-2 pl-2.5 tracking-normal text-ink">
        {t('role.admin')}<Icon name="down" size={14} />
      </button>
      {open && (
        <section id="admin-menu" className="frame anim-rise absolute top-full right-0 z-30 mt-2 flex w-60 flex-col gap-3 p-4" style={{ boxShadow: 'var(--lift)' }}>
          <div className="flex flex-col gap-1">
            <span className="font-display text-lg font-extrabold">{t('role.admin')}</span>
            <span className="text-sm text-muted">{t('admin.signedIn')}</span>
          </div>
          <button type="button" className="btn btn-ai" onClick={logout}>{t('admin.logout')}</button>
        </section>
      )}
    </div>
  )
}

// ---------- Runde ----------

function RoundTab({ view, act }: { view: View; act: Act }) {
  const s = secondsLeft(view, useNow())
  const humans = view.players.filter(p => !p.isAi)
  const next = view.admin!.plan[view.round] // nächste Frage = Index „gespielte Runden“
  const phase: Key = view.phase === 'vote' && !view.votingOpen ? 'phase.voteClosed' : `phase.${view.phase}`
  const running = view.phase === 'answer' || view.phase === 'vote'
  const wide = useWide()
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8">
    <div className="flex flex-col gap-4 lg:sticky lg:top-4">
      <section className="frame flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="label">{view.round > 0 ? t('common.round', { no: view.round, total: view.rounds }) : t('admin.phase')}</span>
            <span className="display text-[26px]">{t(phase)}</span>
          </div>
          <div className="flex items-center gap-3">
            {s != null && <span role="timer" className={`num text-5xl ${timerClass(s, view.paused)}`}>{clock(s)}</span>}
            <button type="button" className="btn size-11 min-h-11 px-0" aria-label={view.sound ? t('admin.soundMute') : t('admin.soundUnmute')}
              onClick={() => act('settings', { settings: { sound: !view.sound } })}><Icon name={view.sound ? 'sound' : 'mute'} /></button>
          </div>
        </div>
        {view.phase === 'answer' && <Progress label={t('admin.answersIn')} n={view.players.filter(p => p.done).length} total={view.players.length} />}
        {view.phase === 'vote' && <Progress label={t('admin.votesIn')} n={view.voters} total={view.audience} />}
        {view.phase === 'lobby' && <p className="m-0 text-muted">{t('admin.lobbySummary', { players: humans.length, audience: view.audience, rounds: view.rounds })}</p>}
      </section>

      {(view.phase === 'lobby' || view.phase === 'reveal') && (
        next ? <NextQuestion key={next.q} q={next.q} index={view.round} total={view.rounds} act={act} />
          : <p className="m-0 text-muted">{t('admin.noQuestionLeft')}</p>
      )}

      <section className="flex flex-col gap-2">
        {view.phase === 'lobby' && (
          <>
            <button className="btn btn-primary" disabled={!humans.length || !next} onClick={() => act('start')}>{t('admin.start')}</button>
            {!humans.length && <p className="m-0 text-center text-sm text-muted">{t('admin.needPlayer')}</p>}
          </>
        )}
        {view.phase === 'reveal' && (next
          ? <button className="btn btn-primary" onClick={() => act('start')}>{t('admin.next')}</button>
          : <button className="btn btn-primary" onClick={() => act('end')}>{t('admin.toFinal')}</button>)}
        {view.phase === 'vote' && <button className="btn btn-primary btn-ai" onClick={() => act('reveal')}>{t('admin.reveal')}</button>}
        {running && (
          <div className="grid grid-cols-2 gap-2">
            {view.paused ? <button className="btn" onClick={() => act('resume')}>{t('admin.resume')}</button>
              : <button className="btn" disabled={view.endsIn == null} onClick={() => act('pause')}>{t('admin.pause')}</button>}
            <button className="btn" disabled={view.endsIn == null} onClick={() => act('extend')}>{t('admin.extend')}</button>
          </div>
        )}
        {view.phase === 'final' && (
          <>
            <Choice label={t('admin.finalSteps')} value={String(view.finalStep)} onChange={step => act('final.step', { step: Number(step) })}
              options={[['0', t('admin.stepPlayers')], ['1', t('admin.stepDetectives')], ['2', t('admin.stepReplay')]]} />
            {view.finalStep < 2 && (
              <button className="btn btn-primary" onClick={() => act('final.step', { step: view.finalStep + 1 })}>
                {view.finalStep === 0 ? t('admin.stepDetectives') : t('admin.stepReplay')} <Icon name="send" />
              </button>
            )}
            <button className="btn" onClick={() => confirm(t('admin.resetConfirm')) && act('reset')}>{t('admin.reset')}</button>
          </>
        )}
        {(running || view.phase === 'reveal') && <button className="btn" onClick={() => confirm(t('admin.endConfirm')) && act('end')}>{t('admin.end')}</button>}
      </section>
    </div>

    <div className="flex flex-col gap-4">
      {wide && <BeamerPreview />}
      {view.phase === 'lobby' && <WhoIsHere view={view} />}
      {running && <AnswerList view={view} act={act} />}
      {view.phase === 'reveal' && <RoundResult view={view} />}
      {view.phase === 'final' && <Standings view={view} />}
    </div>
    </div>
  )
}

/** Ab 1024 px gibt es Platz für zwei Spalten und die Beamer-Vorschau. */
function useWide() {
  const query = matchMedia('(min-width: 1024px)')
  const [wide, setWide] = useState(query.matches)
  useEffect(() => {
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** Live-Bild des Beamers (einklappbar), damit die Moderation sieht, was das Publikum sieht. */
function BeamerPreview() {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box.current!)
    return () => observer.disconnect()
  }, [])
  return (
    <details open className="frame overflow-hidden p-0">
      <summary className="label flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-ink">
        {t('admin.preview')}
        <a className="label text-ink underline underline-offset-4" href="/beamer" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{t('admin.openBeamer')}</a>
      </summary>
      <div ref={box} className="relative w-full overflow-hidden border-t border-line" style={{ height: (width * 9) / 16 }}>
        {width > 0 && (
          <iframe src="/beamer" title={t('admin.preview')} tabIndex={-1} aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{ width: 1600, height: 900, transform: `scale(${width / 1600})` }} />
        )}
      </div>
    </details>
  )
}

function WhoIsHere({ view }: { view: View }) {
  const people = view.admin!.people
  const group = (role: 'player' | 'audience', title: string) => (
    <section className="card flex flex-col gap-3 p-4">
      <span className="label text-ink">{title}</span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {people.filter(p => p.role === role).map(p => (
          <li key={p.id} className={'chip anim-pop py-1 pl-1.5 normal-case tracking-normal ' + (p.online ? 'bg-card' : 'text-muted')}>
            <Avatar value={p.avatar} seed={p.name} size={26} />{p.name}<span className={'size-2 rounded-pill ' + (p.online ? 'bg-fun' : 'bg-line')} />
          </li>
        ))}
      </ul>
      {!people.some(p => p.role === role) && <p className="m-0 text-sm text-muted">{t('people.nobody')}</p>}
    </section>
  )
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {group('player', t('people.players', { n: people.filter(p => p.role === 'player').length, max: view.maxPlayers }))}
      {group('audience', t('people.audience', { n: view.audience }))}
    </div>
  )
}

/** Auflösung für die Moderation: Antworten mit Absendern, Stimmen und Bonus. */
function RoundResult({ view }: { view: View }) {
  const r = view.result
  if (!r) return null
  return (
    <section className="flex flex-col gap-2">
      <span className="label">{t('admin.resultTitle')} · {tn('beamer.votes', r.voters)}</span>
      <div className="grid gap-2 xl:grid-cols-2">
        {r.answers.map(a => (
          <article key={a.letter} className={'card flex flex-col gap-2 p-3 ' + (a.isAi ? 'border-ai' : '')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label text-ink">{a.letter} · {a.name} · {a.isAi ? t('common.ai') : t('common.human')}</span>
              <span className="label tabular-nums">{t('beamer.aiSuspicion')} {a.aiVotes} · {t('beamer.laughs')} {a.funVotes}</span>
            </div>
            <p className="m-0 text-sm leading-snug">{a.text}</p>
            {a.bonus.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {a.bonus.map(b => <span key={b} className="stamp text-[11px]">{t(b === 'fun' ? 'bonus.fun' : 'bonus.disguise')}</span>)}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function Standings({ view }: { view: View }) {
  return (
    <section className="frame flex flex-col gap-1 p-4">
      <span className="label">{t('beamer.standings')}</span>
      <ol className="m-0 flex list-none flex-col p-0">
        {view.players.map(p => (
          <li key={p.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="label w-6 text-ink">{rankOf(view.players, p.points)}</span>
            <PersonAvatar p={p} size={32} />
            <span className="flex-1 font-bold">{p.name}{p.isAi && ' · ' + t('common.ai')}</span>
            <span className="num text-2xl">{p.points}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Progress({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <>
      <div className="label flex justify-between"><span>{label}</span><span className="text-ink tabular-nums">{n} / {total}</span></div>
      <span className="bar h-2"><span className="bg-strong" style={{ width: `${total ? (n * 100) / total : 0}%` }} /></span>
    </>
  )
}

function NextQuestion({ q, index, total, act }: { q: string; index: number; total: number; act: Act }) {
  const [custom, setCustom] = useState('')
  return (
    <section className="card flex flex-col gap-3 p-4">
      <span className="label">{t('admin.nextQuestion')} · {index + 1} / {total}</span>
      <p className="display anim-slot m-0 text-xl">{q}</p>
      <button className="btn self-start" onClick={() => act('plan.reroll', { index })}><Icon name="shuffle" />{t('admin.otherQuestion')}</button>
      <form className="flex gap-2" onSubmit={e => {
        e.preventDefault()
        act('plan.set', { index, question: custom })
        setCustom('')
      }}>
        <input className="field min-w-0 text-base" placeholder={t('admin.replacePlaceholder')} value={custom} maxLength={200}
          onChange={e => setCustom(e.target.value)} aria-label={t('admin.replaceLabel')} />
        <button className="btn" disabled={!custom.trim()}>{t('admin.replace')}</button>
      </form>
    </section>
  )
}

function AnswerList({ view, act }: { view: View; act: Act }) {
  const answers = view.admin!.answers
  const rows = view.players
    .map(p => ({ p, a: answers.find(x => x.authorId === p.id) }))
    .sort((x, y) => (x.a?.letter ?? '~').localeCompare(y.a?.letter ?? '~'))
  const source = (a: (typeof answers)[number]) =>
    a.source === 'live' ? t('admin.sourceLive', { s: ((a.ms ?? 0) / 1000).toFixed(1) })
      : a.source === 'fallback' ? t('admin.sourceFallback') : a.source === 'failed' ? t('admin.sourceFailed') : ''
  return (
    <section className="flex flex-col gap-2">
      <span className="label">{t('admin.answersPrivate')}</span>
      <div className="grid gap-2 xl:grid-cols-2">
      {rows.map(({ p, a }) => {
        const has = !!a?.text.trim()
        const meta = [p.name, p.isAi ? t('common.ai') : t('common.human'), a && !a.final ? t('admin.typing') : a ? source(a) : p.isAi ? t('admin.thinking') : t('admin.typing')].filter(Boolean).join(' · ')
        return (
          <article key={p.id} className="card grid grid-cols-[24px_minmax(0,1fr)_72px] items-start gap-2.5 p-2.5 pl-3">
            <span className="label pt-0.5 text-sm text-ink">{a?.letter ?? '·'}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className={`m-0 text-sm leading-snug ${a?.hidden ? 'text-muted line-through' : ''}`}>{a?.text || '…'}</p>
              <span className="label text-[11px]">{meta}</span>
            </div>
            {has && (
              <button type="button" aria-pressed={a!.hidden} aria-label={t(a!.hidden ? 'admin.showAria' : 'admin.hideAria', { name: p.name })}
                onClick={() => act('hide', { id: p.id })}
                className={`btn label min-h-11 flex-col gap-0.5 px-0 text-[10px] ${a!.hidden ? 'bg-strong text-on-strong' : 'text-ink'}`}>
                <Icon name={a!.hidden ? 'eyeOff' : 'eye'} size={18} />{a!.hidden ? t('admin.hidden') : t('admin.visible')}
              </button>
            )}
          </article>
        )
      })}
      </div>
    </section>
  )
}

// ---------- Fragen ----------

// Unbekannte Themen aus einem erweiterten Katalog erscheinen mit ihrem Rohnamen
const topicName = (topic: string) => tError(`topic.${topic}`).replace(/^topic\./, '')

function QuestionsTab({ view, act }: { view: View; act: Act }) {
  const { plan, catalog, topics, settings, own, hasDefaults } = view.admin!
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [ownOpen, setOwnOpen] = useState(false)
  // Bearbeiten: Fragen aus der Sammlung mit ihren Antworten, spontane Plan-Fragen ohne
  const edit = (q: string) => setDraft({ original: q, q, ai: own.find(o => o.q === q)?.ai ?? [], saved: own.some(o => o.q === q) })
  const toggleTopic = (topic: string) => act('settings', {
    settings: { topics: settings.topics.includes(topic) ? settings.topics.filter(x => x !== topic) : [...settings.topics, topic] },
  })
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="display m-0 text-2xl">{tn('plan.title', plan.length)}</h2>
          {hasDefaults && (
            <button type="button" className="btn min-h-8 px-2.5 text-xs" onClick={() => confirm(t('plan.loadDefaultsConfirm')) && act('defaults.load')}>{t('plan.loadDefaults')}</button>
          )}
        </div>
        <p className="m-0 text-sm text-muted">{t('plan.hint')}</p>
      </section>
      <PlanList view={view} act={act} onEdit={edit} />
      {draft && <QuestionEditor view={view} draft={draft} onClose={() => setDraft(null)} />}
    </div>
    <div className="flex flex-col gap-4 lg:sticky lg:top-4">
      <section className="flex flex-col gap-2">
        <span className="label text-ink">{t('plan.topics')}</span>
        <div className="flex flex-wrap gap-2">
          {topics.map(topic => {
            const on = settings.topics.includes(topic)
            return (
              <button key={topic} type="button" aria-pressed={on} onClick={() => toggleTopic(topic)}
                className={`btn min-h-10 px-3 text-sm ${on ? 'border-transparent bg-strong text-on-strong' : ''}`}>
                {on && <Icon name="check" size={16} />}{topicName(topic)}
              </button>
            )
          })}
        </div>
        <p className="m-0 text-sm text-muted">{t('plan.topicsHint')}</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={() => act('plan.add')}>{t('plan.addRandom')}</button>
        <button className="btn" onClick={() => act('plan.draw')}><Icon name="shuffle" size={18} />{t('plan.draw')}</button>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => {
        setOwnOpen(true) // aufklappen, damit die neue Frage nach dem Speichern zu sehen ist
        setDraft({ q: '', ai: [] })
      }}><Icon name="plus" size={18} />{t('own.new')}</button>
      {/* Eigene Fragen: aufklappbar wie die Themen darunter, zusätzlich mit Bearbeiten */}
      <details className="card p-4" open={ownOpen} onToggle={e => setOwnOpen(e.currentTarget.open)}>
        <summary className="label cursor-pointer text-ink">{tn('plan.catalogTopic', own.length, { topic: topicName(OWN_TOPIC) })}</summary>
        {!own.length && <p className="m-0 mt-2 text-sm text-muted">{t('own.empty')}</p>}
        <ul className="m-0 mt-2 flex list-none flex-col p-0">
          {own.map(o => {
            const inPlan = plan.some(p => p.q === o.q)
            return (
              <li key={o.q} className="flex items-start gap-2 border-b border-line py-2 last:border-0">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="leading-snug">{o.q}</span>
                  <span className={`label text-[11px] ${o.ai.length ? '' : 'text-ai-text'}`}>{o.ai.length ? tn('own.answers', o.ai.length) : t('own.noAnswers')}</span>
                </div>
                <button className="btn min-h-10 px-2.5" aria-label={t('own.edit', { q: o.q })} onClick={() => edit(o.q)}><Icon name="pen" size={18} /></button>
                <button className="btn min-h-10 px-2.5" disabled={inPlan} aria-label={t('plan.addCatalog', { q: o.q })}
                  onClick={() => act('plan.add', { catalog: catalog.findIndex(c => c.q === o.q) })}><Icon name={inPlan ? 'check' : 'plus'} size={18} /></button>
              </li>
            )
          })}
        </ul>
      </details>
      {topics.filter(topic => topic !== OWN_TOPIC).map(topic => {
        const list = catalog.map((c, i) => ({ ...c, i })).filter(c => c.topic === topic)
        return (
          <details key={topic} className="card p-4">
            <summary className="label cursor-pointer text-ink">{tn('plan.catalogTopic', list.length, { topic: topicName(topic) })}</summary>
            <ul className="m-0 mt-2 flex list-none flex-col p-0">
              {list.map(({ q, i }) => {
                const inPlan = plan.some(p => p.q === q)
                return (
                  <li key={q} className="flex items-start gap-2 border-b border-line py-2 last:border-0">
                    <span className={`flex-1 leading-snug ${inPlan ? 'text-muted' : ''}`}>{q}</span>
                    <button className="btn min-h-10 px-2.5" disabled={inPlan} aria-label={t('plan.addCatalog', { q })}
                      onClick={() => act('plan.add', { catalog: i })}><Icon name={inPlan ? 'check' : 'plus'} size={18} /></button>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </div>
    </div>
  )
}

type PlanItem = NonNullable<View['admin']>['plan'][number]
/** q = Text der gezogenen Frage, done = losgelassen (die Karte folgt der Maus nicht mehr und wartet auf den neuen Plan). */
type Drag = { q: string; done: boolean; from: number; to: number; dy: number; startY: number; top: number; height: number; base: number; heights: number[] }
const GAP = 8 // entspricht gap-2 der Liste

/**
 * Fragenplan: am Griff ziehen (Maus, Touch) oder Griff fokussieren und Pfeiltasten.
 * Beim Ziehen schwebt die Karte, ein gestrichelter Platz zeigt, wo sie landet, die anderen gleiten zur Seite.
 */
function PlanList({ view, act, onEdit }: { view: View; act: Act; onEdit: (q: string) => void }) {
  const plan = view.admin!.plan
  const played = view.round
  const live = view.phase === 'answer' || view.phase === 'vote'
  const list = useRef<HTMLOListElement>(null)
  const [dragState, setDragState] = useState<Drag | null>(null)
  const [focusQ, setFocusQ] = useState<string | null>(null)
  // Stand des Ziehens ohne Warten aufs Rendern: Die Maus-Ereignisse lesen und schreiben hier,
  // damit eine verspätete Bewegung nach dem Loslassen die Karte nicht wieder anhebt
  const latest = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    latest.current = d
    setDragState(d)
  }
  // Sobald der neue Plan da ist, steht die Frage nicht mehr an ihrem alten Platz: Dann ist das Ziehen vorbei
  const drag = dragState && plan[dragState.from]?.q === dragState.q ? dragState : null
  const dragging = !!drag && !drag.done

  const move = async (from: number, to: number) => {
    if (to !== from && to >= played && to < plan.length) {
      buzz(15)
      await act('plan.move', { index: from, to })
    }
    setDrag(null) // erst nach der Antwort: der neue Plan ist dann schon da, nichts springt zurück
  }

  const pickUp = (e: React.PointerEvent, i: number) => {
    e.preventDefault()
    const rows = [...list.current!.querySelectorAll<HTMLElement>('[data-row]')]
    const open = rows.slice(played)
    setDrag({
      q: plan[i].q, done: false, from: i, to: i, dy: 0, startY: e.pageY, top: rows[i].offsetTop, height: rows[i].offsetHeight,
      base: open[0].offsetTop, heights: open.filter(r => r !== rows[i]).map(r => r.offsetHeight),
    })
    buzz(8)
  }

  // Beim Ziehen am Fenster lauschen; die Plätze werden aus den Höhen beim Anheben berechnet, nicht aus dem wackelnden DOM
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const drag = latest.current
      if (!drag || drag.done) return
      const dy = e.pageY - drag.startY
      const center = drag.top + dy + drag.height / 2
      let best = 0, bestDist = Infinity, y = drag.base
      for (let k = 0; k <= drag.heights.length; k++) {
        const dist = Math.abs(y + drag.height / 2 - center)
        if (dist < bestDist) [best, bestDist] = [k, dist]
        y += (drag.heights[k] ?? 0) + GAP
      }
      setDrag({ ...drag, dy, to: played + best })
      // shortcut: scrollt nur, solange sich der Finger bewegt; reicht für Pläne mit ein paar Dutzend Fragen
      if (e.clientY < 80) scrollBy(0, -16)
      else if (e.clientY > innerHeight - 80) scrollBy(0, 16)
    }
    const onUp = () => {
      const drag = latest.current
      if (!drag || drag.done) return
      setDrag({ ...drag, done: true })
      move(drag.from, drag.to)
    }
    const onCancel = () => setDrag(null)
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onCancel)
    return () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onCancel)
    }
  }, [dragging])

  // Hat sich der Plan während des Ziehens von anderswo geändert, wird abgebrochen statt eine falsche Karte zu bewegen
  useEffect(() => {
    if (dragState && !dragState.done && !drag) setDrag(null)
  }, [dragState, drag])

  // Nach dem Verschieben per Tastatur bleibt der Fokus auf dem Griff
  useEffect(() => {
    if (focusQ) list.current?.querySelector<HTMLElement>(`[data-handle="${CSS.escape(focusQ)}"]`)?.focus()
  }, [plan, focusQ])

  const rest = drag ? plan.filter((_, i) => i !== drag.from) : plan
  const rows: (PlanItem | null)[] = drag ? [...rest.slice(0, drag.to), null, ...rest.slice(drag.to)] : plan
  const row = (q: PlanItem, i: number, floating = false) => {
    const locked = i < played
    return (
      <>
        {locked ? <span className="label grid h-10 place-items-center text-ink">{i + 1}</span> : (
          <button type="button" data-handle={q.q} aria-label={t('plan.drag', { n: i + 1 })} tabIndex={floating ? -1 : 0}
            className={`flex h-10 w-9 touch-none flex-col items-center justify-center rounded-box border-0 bg-transparent p-0 text-ink transition-colors hover:bg-raised ${floating ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={e => pickUp(e, i)}
            onKeyDown={e => {
              const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
              if (to === null) return
              e.preventDefault()
              setFocusQ(q.q)
              move(i, to)
            }}>
            <span className="label text-[11px] leading-none text-ink">{i + 1}</span>
            <Icon name="grip" size={18} />
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <p className="m-0 leading-snug">{q.q}</p>
          <span className="label text-[11px]">
            {[topicName(q.topic), locked && (live && i === played - 1 ? t('plan.current') : t('plan.played')), q.custom && t('own.noAnswers')].filter(Boolean).join(' · ')}
          </span>
        </div>
        {!locked && (
          <div className="col-start-2 flex justify-end gap-1.5 sm:col-start-auto">
            {(q.custom || q.own) && <button className="btn min-h-10 px-2.5" tabIndex={floating ? -1 : 0} aria-label={t('plan.edit', { n: i + 1 })} onClick={() => onEdit(q.q)}><Icon name="pen" size={18} /></button>}
            {!q.custom && <button className="btn min-h-10 px-2.5" tabIndex={floating ? -1 : 0} aria-label={t('plan.reroll', { n: i + 1 })} onClick={() => act('plan.reroll', { index: i })}><Icon name="shuffle" size={18} /></button>}
            <button className="btn min-h-10 px-2.5" tabIndex={floating ? -1 : 0} aria-label={t('plan.remove', { n: i + 1 })} onClick={() => act('plan.remove', { index: i })}><Icon name="x" size={18} /></button>
          </div>
        )}
      </>
    )
  }
  const grid = 'grid grid-cols-[36px_minmax(0,1fr)] items-start gap-2 p-2.5 pl-1.5 sm:grid-cols-[36px_minmax(0,1fr)_auto]'
  return (
    <ol ref={list} className={`relative m-0 flex list-none flex-col gap-2 p-0 ${drag ? 'select-none' : ''}`}>
      {rows.map((q, i) => q === null ? (
        <motion.li key="drop-slot" layout="position" transition={SPRING} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="tint-fun grid place-items-center rounded-box border-2 border-dashed" style={{ height: drag!.height }}>
          <span className="label anim-breathe text-ink">{t('plan.dropHere', { n: i + 1 })}</span>
        </motion.li>
      ) : (
        <motion.li key={q.q} layoutId={q.q} transition={SPRING} data-row="" className={`card ${grid} ${i < played ? 'opacity-60' : ''}`}>
          {row(q, i)}
        </motion.li>
      ))}
      {drag && (
        <motion.li layoutId={plan[drag.from].q} transition={SPRING} aria-hidden="true"
          className={`card pointer-events-none absolute inset-x-0 z-20 ${grid}`}
          style={{ top: drag.top, y: drag.dy, boxShadow: 'var(--lift)' }}
          animate={{ rotate: -1.2, scale: 1.02 }}>
          {row(plan[drag.from], drag.to, true)}
        </motion.li>
      )}
    </ol>
  )
}

// ---------- Leute ----------

function PeopleTab({ view, act }: { view: View; act: Act }) {
  const people = view.admin!.people
  const group = (role: 'player' | 'audience', title: string) => {
    const list = people.filter(p => p.role === role)
    return (
      <section className="flex flex-col gap-2">
        <h2 className="label m-0 text-ink">{title}</h2>
        {!list.length && <p className="m-0 text-muted">{t('people.nobody')}</p>}
        {list.map(p => (
          <div key={p.id} className="card flex items-center gap-3 p-2.5 pl-3">
            <Avatar value={p.avatar} seed={p.name} size={36} />
            <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
            <span className={`size-2.5 shrink-0 rounded-pill ${p.online ? 'bg-fun' : 'bg-line'}`} title={p.online ? t('people.online') : t('people.offline')} />
            <span className="num text-2xl">{p.points}</span>
            <button className="btn min-h-10 px-3 text-sm" aria-label={t('people.kickAria', { name: p.name })}
              onClick={() => confirm(t('people.kickConfirm', { name: p.name })) && act('kick', { id: p.id })}>{t('people.kick')}</button>
          </div>
        ))}
      </section>
    )
  }
  const players = people.filter(p => p.role === 'player').length
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {group('player', t('people.players', { n: players, max: view.maxPlayers }))}
      {group('audience', t('people.audience', { n: view.audience }))}
    </div>
  )
}

// ---------- Spiel (Einstellungen) ----------

function GameTab({ view, act }: { view: View; act: Act }) {
  const s = view.admin!.settings
  const lobby = view.phase === 'lobby'
  const set = (patch: Partial<Settings>) => act('settings', { settings: patch })
  const seconds = (n: number) => t('settings.seconds', { n })
  return (
    <div className="flex flex-col gap-5">
      {!lobby && <p className="chip m-0 justify-center bg-card normal-case tracking-normal">{t('settings.locked')}</p>}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <section className="flex flex-col gap-5">
      <h2 className="display m-0 text-2xl">{t('settings.groupRules')}</h2>
      <Choice label={t('settings.language')} disabled={!lobby} value={s.language}
        options={[['de', t('lang.de')], ['en', t('lang.en')]]} onChange={language => set({ language })} />
      <Select label={t('settings.answerSeconds')} disabled={!lobby} value={s.answerSeconds} options={[30, 45, 60, 90, 120, 180]} format={seconds} onChange={answerSeconds => set({ answerSeconds })} />
      <Select label={t('settings.voteSeconds')} disabled={!lobby} value={s.voteSeconds} options={[20, 30, 45, 60, 90]} format={seconds} onChange={voteSeconds => set({ voteSeconds })} />
      <Select label={t('settings.maxChars')} disabled={!lobby} value={s.maxChars} options={[100, 150, 200, 300, 400]} format={n => t('settings.chars', { n })} onChange={maxChars => set({ maxChars })} />
      <Select label={t('settings.maxPlayers')} disabled={!lobby} value={s.maxPlayers} options={[1, 2, 3, 4, 5, 6, 7, 8, 10, 12]} format={String} onChange={maxPlayers => set({ maxPlayers })} />
      <p className="m-0 text-sm text-muted">{t('settings.rounds', { n: view.rounds })}</p>
      </section>
      <section className="flex flex-col gap-5">
      <h2 className="display m-0 text-2xl">{t('settings.groupAi')}</h2>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={!lobby}>
        <legend className="label mb-2 p-0 text-ink">{t('settings.ais')}</legend>
        {(Object.keys(AI_NAMES) as Provider[]).map(p => {
          const on = s.ais.includes(p)
          return (
            <label key={p} className="card flex items-center gap-3 p-3">
              <input type="checkbox" className="size-5 accent-[var(--strong)]" checked={on} disabled={on && s.ais.length === 1}
                onChange={() => set({ ais: on ? s.ais.filter(x => x !== p) : [...s.ais, p] })} />
              <span className="flex-1 font-bold">{AI_NAMES[p]}</span>
              {view.keys && !view.keys[p] && <span className="label text-[11px]">{t('settings.noKey')}</span>}
            </label>
          )
        })}
      </fieldset>
      <Choice label={t('settings.aiStyle')} disabled={!lobby} value={s.aiStyle}
        options={[['natural', t('settings.styleNatural')], ['disguised', t('settings.styleDisguised')]]} onChange={aiStyle => set({ aiStyle })} />
      <h2 className="display m-0 mt-3 text-2xl">{t('settings.groupScreen')}</h2>
      <Choice label={t('settings.beamerTheme')} value={s.beamerTheme}
        options={[['light', t('settings.light')], ['dark', t('settings.dark')]]} onChange={beamerTheme => set({ beamerTheme })} />
      <Choice label={t('settings.sound')} value={s.sound ? 'on' : 'off'}
        options={[['on', t('settings.on')], ['off', t('settings.off')]]} onChange={v => set({ sound: v === 'on' })} />
      </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-2"><span className="label text-ink">{label}</span>{children}</div>
}

function Choice<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <Field label={label}>
      <div role="group" aria-label={label} className="frame grid overflow-hidden p-0" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([v, text]) => (
          <button key={v} type="button" disabled={disabled} aria-pressed={value === v} onClick={() => onChange(v)}
            className={`relative min-h-11 border-0 bg-transparent px-2 text-sm font-bold transition-colors duration-200 ${value === v ? 'text-on-strong' : 'text-ink'} disabled:opacity-50`}>
            {value === v && <motion.span layoutId={`choice-${label}`} transition={SPRING} className="absolute inset-1 rounded-[calc(var(--r)*.6)] bg-strong" />}
            <span className="relative">{text}</span>
          </button>
        ))}
      </div>
    </Field>
  )
}

function Select({ label, value, options, format, onChange, disabled }: {
  label: string; value: number; options: number[]; format: (n: number) => string; onChange: (v: number) => void; disabled?: boolean
}) {
  const all = [...new Set([...options, value])].sort((a, b) => a - b)
  return (
    <Field label={label}>
      <select className="field text-base" disabled={disabled} value={value} aria-label={label} onChange={e => onChange(Number(e.target.value))}>
        {all.map(n => <option key={n} value={n}>{format(n)}</option>)}
      </select>
    </Field>
  )
}
