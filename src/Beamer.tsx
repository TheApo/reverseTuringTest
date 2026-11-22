import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AI_NAMES, type ResultAnswer } from '../server/game.ts'
import { Avatar, PersonAvatar } from './Avatar.tsx'
import { setLang, t, tn, type Key } from './i18n.ts'
import { useGame, type View } from './socket.ts'
import { SOUNDS, play, soundReady, unlockSound } from './sound.ts'
import { AiTag, Brand, Icon, Qr, clock, rankOf, secondsLeft, setTheme, timerClass, useNow } from './ui.tsx'

// Der Beamer zeichnet auf einer festen 1600×900-Fläche und skaliert sie auf den Bildschirm.
const W = 1600, H = 900
const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host)

export default function Beamer() {
  const { view } = useGame('beamer')
  const scale = useScale()
  const [soundOn, setSoundOn] = useState(soundReady())
  if (view) setLang(view.language, false) // vor dem Rendern der Kinder, damit t() die Spielsprache nutzt
  useEffect(() => {
    if (view) setTheme(view.beamerTheme, false)
  }, [view?.beamerTheme])
  useCues(view)

  return (
    <div className="fixed inset-0 overflow-hidden" onClick={() => unlockSound().then(() => setSoundOn(true))}>
      <div className="absolute top-1/2 left-1/2 flex flex-col gap-6 px-14 pt-8 pb-10"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {view ? <Stage view={view} /> : <p className="label anim-pulse">{t('common.connecting')}</p>}
      </div>
      {view?.sound && !soundOn && view.phase === 'lobby' && <p className="chip fixed bottom-4 left-1/2 m-0 -translate-x-1/2 bg-card">{t('beamer.soundHint')}</p>}
    </div>
  )
}

function useScale() {
  const get = () => Math.min(innerWidth / W, innerHeight / H)
  const [scale, setScale] = useState(get)
  useEffect(() => {
    const onResize = () => setScale(get())
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  return scale
}

/** Töne bei Zeitablauf, Abstimmungsende, Auflösung und Finale. */
function useCues(view: View | null) {
  const last = useRef('')
  const key = view ? `${view.phase}:${view.votingOpen}:${view.finalStep}` : ''
  useEffect(() => {
    const prev = last.current
    last.current = key
    if (!view?.sound || !prev || prev === key) return
    if (view.phase === 'vote') play(SOUNDS.timeUp)
    else if (view.phase === 'reveal') play(SOUNDS.reveal)
    else if (view.phase === 'final') play(SOUNDS.final)
  }, [key])
}

function joinUrls(view: View) {
  // Über localhost geöffnet: Handys brauchen die WLAN-Adresse. Über Tunnel/IP geöffnet: genau diese Adresse.
  const base = isLocal(location.hostname) ? view.joinUrl : location.origin
  const de = view.language === 'de'
  return { player: `${base}${de ? '/spielen' : '/play'}`, audience: `${base}${de ? '/publikum' : '/audience'}` }
}

function Stage({ view }: { view: View }) {
  switch (view.phase) {
    case 'lobby': return <Lobby view={view} />
    case 'answer': return <Answering view={view} />
    case 'vote': return <Voting view={view} />
    case 'reveal': return <Reveal view={view} />
    case 'final': return <Final view={view} />
  }
}

function Top({ view, right }: { view: View; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-6 border-b-2 border-rule pb-3.5">
      <Brand big />
      {view.round > 0 && view.phase !== 'final' && <div className="label text-[15px] text-ink">{t('common.round', { no: view.round, total: view.rounds })}</div>}
      <div className="label text-[15px]">{right ?? tn('beamer.audienceCount', view.audience)}</div>
    </header>
  )
}

function JoinCard({ title, hint, url, size }: { title: string; hint?: string; url: string; size: number }) {
  return (
    <div className="frame anim-rise flex flex-col items-center gap-3 p-5">
      <span className="display text-[40px]">{title}</span>
      {hint && <span className="label -mt-2 text-[13px]">{hint}</span>}
      <Qr url={url} size={size} />
      <span className="label text-[13px] text-ink">{url.replace(/^https?:\/\//, '')}</span>
    </div>
  )
}

function BigTimer({ view, size = 'text-[132px]' }: { view: View; size?: string }) {
  const s = secondsLeft(view, useNow())
  if (s == null) return null
  const pct = Math.min(100, (s * 1000 * 100) / view.duration)
  return (
    <div className="frame flex flex-col gap-3 p-6">
      <span className="label text-sm">{view.paused ? t('common.paused') : t('common.timeLeft')}</span>
      <span role="timer" className={`num ${size} ${timerClass(s, view.paused)}`}>{clock(s)}</span>
      <span className="bar"><span className="bg-ai" style={{ width: `${pct}%`, animation: 'none', transition: 'width .25s linear' }} /></span>
    </div>
  )
}

const Letter = ({ letter }: { letter: string }) => (
  <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-strong font-display text-2xl font-extrabold text-on-strong">{letter}</span>
)

/** Untertitel der Lobby passend zur Zahl der mitspielenden KIs (1 bis 3). */
const TAGLINES: Key[] = ['app.tagline', 'app.tagline2', 'app.tagline3']

/** Spalten und Schriftgröße passend zur Zahl der Antworten: 9 als 3×3 statt 4+4+1, ab 13 fünf Spalten, damit es bei drei Reihen bleibt. */
const gridFor = (n: number): { style: CSSProperties; font: number } =>
  n <= 4 ? { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, font: 26 }
    : n <= 6 || n === 9 ? { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, font: 22 }
      : n <= 12 ? { style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }, font: 19 }
        : { style: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }, font: 17 }

/**
 * Die Karten sind fest hoch. Passt eine Antwort samt Stempeln und Balken nicht hinein, schrumpfen alle Karten gemeinsam,
 * statt dass unten etwas herausragt: erst nur die Schrift der Antworten (ab max, bis 16 px), reicht das nicht, der ganze
 * Karteninhalt (bis auf die Hälfte). key = alles, was die Höhe ändert.
 */
function useFit(max: number, key: string) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fits = () => [...el.children].every(c => c.scrollHeight <= c.clientHeight)
    const fit = () => {
      let font = max, zoom = 100
      const apply = () => {
        el.style.setProperty('--fit', `${font}px`)
        el.style.setProperty('--fit-zoom', String(zoom / 100))
      }
      for (apply(); !fits() && zoom > 50; apply()) {
        if (font > 16) font--
        else zoom -= 5
      }
    }
    fit()
    // Frisch geladener Beamer: Mit den Webfonts bricht der Text anders um, deshalb danach noch einmal messen
    let alive = true
    document.fonts.ready.then(() => alive && fit())
    return () => { alive = false }
  }, [max, key])
  return ref
}

/** Inhalt einer Antwortkarte, der sich mit useFit verkleinern lässt. */
const Fit = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-1 flex-col gap-3" style={{ zoom: 'var(--fit-zoom)' }}>{children}</div>
)

function Lobby({ view }: { view: View }) {
  const humans = view.players.filter(p => !p.isAi)
  const urls = joinUrls(view)
  // Schilder für Menschen und KIs: je mehr es sind, desto kleiner, damit beide Gruppen aufs Bild passen.
  // Die Höchstbreite kürzt lange Namen statt umzubrechen, so bleiben es höchstens 3 bzw. 4 Zeilen
  const count = humans.length + view.ais.length
  const size = count <= 6 ? 0 : count <= 12 ? 1 : 2
  const chip = ['max-w-[330px] py-1.5 pr-4 pl-2 text-[24px]', 'max-w-[212px] py-1 pr-3 pl-1.5 text-[19px]', 'max-w-[164px] py-0.5 pr-2.5 pl-1 text-[17px]'][size]
  const avatar = [44, 34, 30][size]
  const full = size > 0 || view.crowd.length > 12 // volle Lobby: der Untertitel macht Platz für die Leute
  return (
    <>
      <Top view={view} />
      <main className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12">
        <JoinCard title={t('beamer.joinPlayer')} hint={t('beamer.joinPlayerHint')} url={urls.player} size={300} />
        <div className="flex min-w-0 flex-col items-center gap-5 text-center">
          <span className="label text-base">{t('beamer.waiting')}</span>
          <h1 className="display m-0 text-[60px] whitespace-nowrap">{t('app.headline')}</h1>
          {!full && <p className="m-0 max-w-[560px] text-[22px] leading-snug text-muted">{t(TAGLINES[view.aiCount - 1] ?? 'app.tagline')}</p>}
          <Group strong icon="pen" title={t('people.players', { n: humans.length, max: view.maxPlayers })}
            hint={`${t('beamer.playersDo')} · ${tn('audience.aiPlaying', view.aiCount)}`} empty={!count}>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-2.5 p-0">
              {humans.map(p => (
                <li key={p.id} className={`anim-pop chip bg-card font-display tracking-normal normal-case ${chip}`}>
                  <PersonAvatar p={p} size={avatar} /><span className="min-w-0 truncate">{p.name}</span>
                </li>
              ))}
              {/* Die mitspielenden KIs: gleiches Schild, als Roboter und mit KI-Marke */}
              {view.ais.map(id => (
                <li key={id} className={`anim-pop chip border-ai bg-card font-display tracking-normal normal-case ${chip}`}>
                  <PersonAvatar p={{ id, name: AI_NAMES[id], isAi: true }} size={avatar} /><span className="min-w-0 truncate">{AI_NAMES[id]}</span>
                  <span className="chip border-transparent bg-ai px-1.5 py-0 text-[11px] text-on-ai">{t('common.ai')}</span>
                </li>
              ))}
            </ul>
          </Group>
          <Group icon="eye" title={t('people.audience', { n: view.audience })} hint={t('beamer.audienceDo')} empty={!view.crowd.length}>
            <Crowd view={view} />
          </Group>
        </div>
        <JoinCard title={t('beamer.joinAudience')} hint={t('beamer.joinAudienceHint')} url={urls.audience} size={300} />
      </main>
    </>
  )
}

/** Beschrifteter Kasten in der Lobby: trennt sichtbar, wer spielt (kräftiger Kopf) und wer im Publikum sitzt (heller Kopf). */
function Group({ icon, title, hint, strong = false, empty, children }: {
  icon: 'pen' | 'eye'; title: string; hint: string; strong?: boolean; empty: boolean; children: ReactNode
}) {
  return (
    <section className="frame flex w-full flex-col overflow-hidden">
      <header className={`flex items-center justify-between gap-4 px-4 py-2 ${strong ? 'bg-strong text-on-strong' : 'bg-raised text-ink'}`}>
        <h2 className="m-0 flex items-center gap-2.5 font-display text-[26px] font-extrabold"><Icon name={icon} size={26} />{title}</h2>
        <span className="label text-[13px] text-current">{hint}</span>
      </header>
      <div className="p-3">{empty ? <p className="m-0 text-lg text-muted">{t('people.nobody')}</p> : children}</div>
    </section>
  )
}

/** Die Gesichter im Publikum, damit jede:r sich auf dem Beamer wiederfindet. */
function Crowd({ view }: { view: View }) {
  const n = view.crowd.length
  // wenige groß und mit Namen, viele nur als Köpfe, damit alle aufs Bild passen
  const { size, cell, font } = n <= 12 ? { size: 52, cell: 84, font: 15 } : n <= 30 ? { size: 40, cell: 62, font: 12 } : { size: 34, cell: 0, font: 0 }
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-1.5 gap-y-2 p-0">
      {view.crowd.map(p => (
        // Eine KI im Publikum darf breiter sein, damit die KI-Marke neben den Namen passt
        <li key={p.id} title={p.name} className="anim-pop flex flex-col items-center gap-0.5" style={cell ? (p.bot ? { minWidth: cell } : { width: cell }) : undefined}>
          <Avatar value={p.avatar} seed={p.name} robot={p.bot} size={size} label={cell ? undefined : p.name} />
          {cell > 0 && (
            <span className="flex w-full items-center justify-center gap-1 font-semibold" style={{ fontSize: font }}>
              <span className="truncate">{p.name}</span>{p.bot && <AiTag />}
            </span>
          )}
        </li>
      ))}
      {view.audience > n && <li className="label grid h-10 place-items-center px-2 text-ink">+{view.audience - n}</li>}
    </ul>
  )
}

function LateJoin({ view }: { view: View }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <Qr url={joinUrls(view).audience} size={112} />
      <span className="font-display text-xl font-bold leading-tight">{t('beamer.lateJoin')}</span>
    </div>
  )
}

function Answering({ view }: { view: View }) {
  const humans = view.players.filter(p => !p.isAi)
  return (
    <>
      <Top view={view} />
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-12">
        <div className="flex flex-col justify-center gap-8">
          <span className="label text-base">{t('common.question')}</span>
          <h1 className="display anim-rise m-0 text-[86px]">{view.question}</h1>
          <div className="flex flex-col gap-3">
            <span className="label text-base">{t('beamer.writing')}</span>
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
              {humans.map(p => (
                <li key={p.id} className={`chip py-1.5 pr-4 pl-2 font-display text-[24px] tracking-normal normal-case ${p.done ? 'anim-pop border-transparent bg-strong text-on-strong' : 'bg-card'}`}>
                  <PersonAvatar p={p} size={44} />{p.name}{p.done && <Icon name="check" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <aside className="flex flex-col justify-center gap-6">
          <BigTimer view={view} />
          <LateJoin view={view} />
        </aside>
      </main>
    </>
  )
}

function Voting({ view }: { view: View }) {
  const answers = view.answers ?? []
  const grid = gridFor(answers.length)
  const fit = useFit(grid.font, JSON.stringify(answers))
  return (
    <>
      <Top view={view} right={tn('beamer.votes', view.voters)} />
      <section className="flex flex-col gap-1.5">
        <span className="label text-sm">{tn('beamer.voteNow', Math.max(1, view.aiCount))} · {tn('audience.aiPlaying', view.aiCount)}</span>
        <h1 className="display m-0 text-[54px]">{view.question}</h1>
      </section>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-9">
        <div ref={fit} className="grid min-h-0 auto-rows-fr gap-5" style={grid.style}>
          {answers.map((a, i) => (
            <article key={a.letter} className="card anim-rise flex min-h-0 flex-col p-5" style={{ animationDelay: `${i * 120}ms` }}>
              <Fit>
                <Letter letter={a.letter} />
                <p className="m-0 leading-snug" style={{ fontSize: 'var(--fit)' }}>{a.text}</p>
              </Fit>
            </article>
          ))}
          {!answers.length && <p className="display text-4xl">{t('beamer.noAnswers')}</p>}
        </div>
        <aside className="flex flex-col gap-5">
          {view.votingOpen ? <BigTimer view={view} size="text-[104px]" />
            : <div className="frame anim-pop p-6"><p className="display m-0 text-[36px]">{t('beamer.closed')}</p></div>}
          <LateJoin view={view} />
        </aside>
      </main>
    </>
  )
}

function ResultCard({ a, i, voters }: { a: ResultAnswer; i: number; voters: number }) {
  const pct = (n: number) => `${voters ? (n * 100) / voters : 0}%`
  const tag = 600 + i * 350
  return (
    <article className={`card anim-rise flex min-h-0 flex-col p-5 ${a.isAi ? 'border-[3px] border-ai' : ''}`} style={{ animationDelay: `${i * 120}ms` }}>
      <Fit>
      <div className="flex items-center justify-between gap-3">
        <Letter letter={a.letter} />
        <span className={`chip anim-pop py-0.5 pl-1 text-[14px] ${a.isAi ? 'border-transparent bg-ai text-on-ai' : 'border-transparent bg-fun text-on-fun'}`} style={{ animationDelay: `${tag}ms` }}>
          <PersonAvatar p={{ id: a.authorId, name: a.name, isAi: a.isAi, avatar: a.avatar }} size={30} />
          {a.isAi ? t('common.ai') : t('common.human')} · {a.name}
        </span>
      </div>
      <p className="m-0 flex-1 leading-snug" style={{ fontSize: 'var(--fit)' }}>{a.text}</p>
      {a.bonus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.bonus.map(b => <span key={b} className="stamp anim-pop px-2 py-0.5 text-[12px]" style={{ animationDelay: `${tag + 1400}ms` }}>{t(b === 'fun' ? 'bonus.fun' : 'bonus.disguise')}</span>)}
        </div>
      )}
      <div className="label grid grid-cols-[120px_minmax(0,1fr)_34px] items-center gap-x-3 gap-y-2 text-[13px]">
        <span>{t('beamer.aiSuspicion')}</span>
        <span className="bar"><span className="bg-ai" style={{ width: pct(a.aiVotes), animationDelay: `${tag + 300}ms` }} /></span>
        <span className="text-right text-ink tabular-nums">{a.aiVotes}</span>
        <span>{t('beamer.laughs')}</span>
        <span className="bar"><span className="bg-fun" style={{ width: pct(a.funVotes), animationDelay: `${tag + 500}ms` }} /></span>
        <span className="text-right text-ink tabular-nums">{a.funVotes}</span>
      </div>
      </Fit>
    </article>
  )
}

function Reveal({ view }: { view: View }) {
  const r = view.result
  const grid = gridFor(r?.answers.length ?? 0)
  const fit = useFit(grid.font - 2, JSON.stringify(r?.answers ?? []))
  if (!r) return null
  if (view.standings) return <Standings view={view} result={r} />
  const fooled = r.answers.filter(a => a.bonus.includes('disguise')).map(a => a.name)
  const late = 800 + r.answers.length * 350
  return (
    <>
      <Top view={view} right={tn('beamer.votes', r.voters)} />
      <section className="flex flex-col gap-1.5">
        <span className="label text-sm">{t('phase.reveal')}</span>
        <h1 className="display m-0 text-[48px]">{r.question}</h1>
      </section>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-9">
        <div ref={fit} className="grid min-h-0 auto-rows-fr gap-5" style={grid.style}>
          {r.answers.map((a, i) => <ResultCard key={a.letter} a={a} i={i} voters={r.voters} />)}
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <section className="frame anim-rise flex flex-col gap-1 p-5" style={{ animationDelay: `${late}ms` }}>
            <span className="label text-sm">{t('beamer.standings')} · {t('role.player')}</span>
            <ol className="m-0 flex list-none flex-col p-0">
              {/* Die besten 5, alle zeigt der Zwischenstand. Mehr passt neben Trefferquote und Detektiven nicht in die Spalte */}
              {view.players.slice(0, 5).map(p => (
                <li key={p.id} className="grid grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line py-1 last:border-0">
                  <span className="label text-sm">{String(rankOf(view.players, p.points)).padStart(2, '0')}</span>
                  <span className="flex min-w-0 items-center gap-2 truncate font-display text-[23px] font-bold">
                    <PersonAvatar p={p} size={34} />{p.name}{p.isAi && <span className="chip border-transparent bg-ai px-1.5 py-0 text-[11px] text-on-ai">{t('common.ai')}</span>}
                  </span>
                  <span className="label text-[15px] text-ai-text">{r.deltas[p.id] ? `+${r.deltas[p.id]}` : ''}</span>
                  <span className="num min-w-8 text-right text-[32px]">{p.points}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="anim-rise flex flex-col gap-1 rounded-box bg-strong p-5 text-on-strong" style={{ animationDelay: `${late + 300}ms` }}>
            <span className="label text-[13px] text-on-strong opacity-80">{t('beamer.caught')}</span>
            <span className="num text-[52px]">{t('beamer.caughtOf', { n: r.caught, total: r.voters })}</span>
            <span className="text-base leading-snug">{fooled.length ? tn('beamer.fooled', fooled.length, { names: fooled.join(', ') }) : t('beamer.notFooled')}</span>
          </section>
          <Detectives view={view} delay={late + 600} />
        </aside>
      </main>
    </>
  )
}

type Bonus = ResultAnswer['bonus'][number]
const BONUSES: Bonus[] = ['disguise', 'fun']
/** fun und disguise: wie oft jemand den jeweiligen Bonus bisher geholt hat (nur Spieler). */
type Ranked = { id: string; name: string; points: number; avatar: View['players'][number]['avatar']; robot?: string; fun?: number; disguise?: number }

/**
 * Zwischenstand nach einer Runde, bildschirmfüllend: links alle Spieler samt KIs, rechts die besten 8 Detektive.
 * Zum Zuschauen: Erst steht die Reihenfolge von vor der Runde da, dann rutschen alle an ihren neuen Platz.
 */
function Standings({ view, result }: { view: View; result: NonNullable<View['result']> }) {
  const { deltas } = result
  const gained: Record<string, Bonus[]> = Object.fromEntries(result.answers.map(a => [a.authorId, a.bonus]))
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMoved(true)
      if (view.sound) play(SOUNDS.reveal)
    }, 1900)
    return () => clearTimeout(timer)
  }, [])
  return (
    <>
      <Top view={view} />
      <h1 className="display m-0 text-[64px]">{t('beamer.standings')}</h1>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-9">
        <RankList strong title={t('role.player')} people={view.players.map(p => ({ ...p, robot: p.isAi ? p.id : undefined }))}
          deltas={deltas} gained={gained} moved={moved} unit={t('common.pointsUnit')} empty={t('people.nobody')} />
        <RankList newcomers limit={8} title={`${t('beamer.detectives')} · ${t('role.audience')}`} people={view.detectives.map(d => ({ ...d, robot: d.bot }))}
          deltas={deltas} moved={moved} unit={t('beamer.hitsUnit')} empty={t('beamer.noDetectives')} />
      </main>
    </>
  )
}

/**
 * Rangliste, die von der alten in die neue Reihenfolge rutscht (moved). people = neue Reihenfolge, die Punkte vor der Runde
 * ergeben sich aus deltas. Zu sehen sind die ersten limit Plätze: Wer darunter fällt, fliegt sichtbar raus, wer aufsteigt, kommt herein.
 * newcomers: Wer vor der Runde 0 Punkte hatte, stand noch nicht auf der Liste (Detektive).
 * gained (nur Spieler): die Boni dieser Runde. Dann zeigt jede Zeile zwei Zähler, woher die Punkte stammen: getarnt (+2), lustigste (+1).
 */
function RankList({ title, unit, people, deltas, gained, moved, empty, limit = people.length, strong = false, newcomers = false }: {
  title: string; unit: string; people: Ranked[]; deltas: Record<string, number>; gained?: Record<string, Bonus[]>; moved: boolean; empty: string
  limit?: number; strong?: boolean; newcomers?: boolean
}) {
  const tone = (b: Bonus) => (b === 'fun' ? 'bg-fun text-on-fun' : 'bg-ai text-on-ai')
  const before = (p: Ranked) => p.points - (deltas[p.id] ?? 0)
  const old = [...people].sort((a, b) => before(b) - before(a)) // stabil: bei Gleichstand bleibt die neue Reihenfolge
  const oldPoints = people.map(p => ({ points: before(p) }))
  const shown = Math.min(limit, people.length)
  // Die Liste füllt die Höhe unter der Überschrift (568 px der 900er-Fläche): wenige Leute groß, 15 Spieler passen gerade noch
  const row = Math.max(36, Math.min(92, Math.floor(568 / Math.max(1, shown))))
  const name = Math.min(40, Math.round(row * 0.5))
  return (
    <section className="frame flex min-h-0 flex-col overflow-hidden">
      <h2 className={`m-0 flex items-baseline justify-between gap-4 px-6 py-3 font-display text-[28px] font-extrabold ${strong ? 'bg-strong text-on-strong' : 'bg-raised text-ink'}`}>
        {title}
        <span className="flex items-center gap-5 text-[15px] font-semibold">
          {gained && BONUSES.map(b => (
            <span key={b} className="flex items-center gap-1.5"><span className={`size-3 ${tone(b)}`} />{t(b === 'fun' ? 'beamer.tallyFun' : 'beamer.tallyDisguise')}</span>
          ))}
          <span className="text-[17px] opacity-80">{unit}</span>
        </span>
      </h2>
      {!people.length && <p className="m-0 p-6 text-[24px] text-muted">{empty}</p>}
      <ol className="relative mx-4 my-2 list-none p-0" style={{ height: shown * row }}>
        {people.map((p, now) => {
          const at = moved ? now : old.indexOf(p)
          const points = moved ? p.points : before(p)
          const climbed = rankOf(oldPoints, before(p)) - rankOf(people, p.points)
          const visible = at < shown && (moved || !newcomers || before(p) > 0)
          return (
            <li key={p.id} className="absolute inset-x-0 top-0 grid grid-cols-[48px_64px_minmax(0,1fr)_auto_auto_72px] items-center gap-2 border-b border-line px-2" style={{
              height: row, zIndex: climbed > 0 ? 2 : 1, opacity: visible ? 1 : 0, transform: `translateY(${Math.min(at, shown) * row}px)`,
              background: moved && climbed > 0 ? 'var(--tint-fun)' : 'var(--card)',
              // Von oben nach unten leicht versetzt, mit kleinem Überschwinger: Die Liste sortiert sich sichtbar um
              transition: `transform .9s cubic-bezier(.3, 1.3, .5, 1) ${now * 50}ms, opacity .5s, background .5s`,
            }}>
              <span className="label text-ink" style={{ fontSize: name * 0.6 }}>
                {String(moved ? rankOf(people, p.points) : rankOf(oldPoints, before(p))).padStart(2, '0')}
              </span>
              {/* Aufstieg fällt auf, Abstieg bleibt leise: Wer überholt wurde, hat ja nichts falsch gemacht */}
              <span style={{ fontSize: name * 0.5 }}>
                {moved && climbed > 0 && <span className="chip anim-pop border-transparent bg-fun px-1.5 py-0 text-[1em] text-on-fun">▲ {climbed}</span>}
                {moved && climbed < 0 && <span className="label text-[.9em] text-muted">▼ {-climbed}</span>}
              </span>
              <span className="flex min-w-0 items-center gap-3 font-display font-bold" style={{ fontSize: name }}>
                <Avatar value={p.avatar} seed={p.name} robot={p.robot} size={Math.round(row * 0.72)} /><span className="truncate">{p.name}</span>{p.robot && <AiTag />}
              </span>
              <span className="flex gap-1.5" style={{ fontSize: name * 0.5 }}>
                {gained && BONUSES.map(b => {
                  const fresh = !!gained[p.id]?.includes(b) // in dieser Runde geholt: zählt erst nach dem Umsortieren mit
                  const n = (p[b] ?? 0) - (fresh && !moved ? 1 : 0)
                  return (
                    <span key={b + n} className={`chip w-[2.6em] justify-center border-transparent px-0 py-0 text-[1em] ${tone(b)} ${n ? '' : 'invisible'} ${fresh && moved ? 'anim-pop' : ''}`}>{n}×</span>
                  )
                })}
              </span>
              <span className="label min-w-10 text-right text-ai-text" style={{ fontSize: name * 0.6 }}>
                {moved && deltas[p.id] > 0 && <span className="anim-pop inline-block">+{deltas[p.id]}</span>}
              </span>
              <span key={points} className={`num text-right ${moved && deltas[p.id] ? 'anim-pop' : ''}`} style={{ fontSize: Math.min(56, Math.round(row * 0.62)) }}>{points}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Detectives({ view, delay }: { view: View; delay: number }) {
  if (!view.detectives.length) return null
  return (
    <section className="card anim-rise flex flex-col gap-2 p-4" style={{ animationDelay: `${delay}ms` }}>
      <span className="label text-sm">{t('beamer.detectives')} · {t('role.audience')}</span>
      {view.detectives.slice(0, 3).map(d => (
        <div key={d.name} className="flex items-center justify-between text-[19px] font-semibold">
          <span className="flex items-center gap-2"><Avatar value={d.avatar} seed={d.name} robot={d.bot} size={32} />{d.name}{d.bot && <AiTag />}</span><span className="label text-sm">{tn('beamer.hits', d.points)}</span>
        </div>
      ))}
    </section>
  )
}

type PodiumEntry = { id: string; name: string; points: number; avatar: ReactNode; tag?: ReactNode }

/** Podest für drei: Platz 2 links, 1 in der Mitte, 3 rechts. Gleiche Punkte, gleicher Platz und gleiche Höhe. */
function Podium({ entries, unit }: { entries: PodiumEntry[]; unit: (n: number) => string }) {
  const order = [entries[1], entries[0], entries[2]]
  return (
    <div className="mx-auto mt-auto grid w-full max-w-[1100px] grid-cols-3 items-end gap-6">
      {order.map((p, i) => {
        if (!p) return <div key={i} />
        const rank = rankOf(entries, p.points)
        return (
          <div key={p.id} className="flex flex-col items-center gap-2">
            <span className="anim-pop" style={{ animationDelay: `${900 + i * 250}ms` }}>{p.avatar}</span>
            <span className="anim-rise flex items-center gap-2 font-display text-[32px] font-extrabold" style={{ animationDelay: `${1100 + i * 250}ms` }}>
              {p.name}{p.tag}
            </span>
            <div className={`anim-lift flex w-full flex-col items-center gap-1 rounded-t-box pt-5 ${rank === 1 ? 'bg-strong text-on-strong' : 'bg-card text-ink'}`}
              style={{ height: [300, 220, 160][rank - 1] ?? 140, animationDelay: `${i * 250}ms` }}>
              <span className="num text-[76px]">{rank}</span>
              <span className="label text-sm text-current">{unit(p.points)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Final({ view }: { view: View }) {
  return (
    <>
      <Top view={view} right={t('final.step', { n: view.finalStep + 1, total: 3 })} />
      {view.finalStep === 0 && <FinalPlayers key="players" view={view} />}
      {view.finalStep === 1 && <FinalDetectives key="detectives" view={view} />}
      {view.finalStep === 2 && <FinalReplay key="replay" view={view} />}
    </>
  )
}

function FinalPlayers({ view }: { view: View }) {
  const ranked = view.players
  const top = ranked.filter(p => rankOf(ranked, p.points) === 1)
  const machine = top.length > 0 && top.every(p => p.isAi)
  const big = (i: number) => (i === 0 ? 130 : 104)
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4">
      <Confetti />
      <span className="label text-center text-base">{t('phase.final')} · {t('role.player')}</span>
      <h1 className="display anim-pop m-0 text-center text-[92px]">{machine ? t('final.machineWins') : t('final.humansWin')}</h1>
      <Podium unit={n => tn('common.points', n)} entries={ranked.slice(0, 3).map((p, i) => ({
        id: p.id, name: p.name, points: p.points, avatar: <PersonAvatar p={p} size={big(i)} />,
        tag: p.isAi ? <span className="chip border-transparent bg-ai text-[12px] text-on-ai">{t('common.ai')}</span> : undefined,
      }))} />
      {ranked.length > 3 && (
        <p className="label m-0 text-center text-sm">{ranked.slice(3).map(p => `${rankOf(ranked, p.points)}. ${p.name} ${p.points}`).join(' · ')}</p>
      )}
    </main>
  )
}

function FinalDetectives({ view }: { view: View }) {
  const d = view.detectives.slice(0, 3)
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4">
      {d.length > 0 && <Confetti />}
      <span className="label text-center text-base">{t('role.audience')} · {t('final.detectivesSub')}</span>
      <h1 className="display anim-pop m-0 text-center text-[92px]">{t('final.detectivesTitle')}</h1>
      {d.length ? (
        <Podium unit={n => tn('beamer.hits', n)} entries={d.map((p, i) => ({
          id: p.name, name: p.name, points: p.points, avatar: <Avatar value={p.avatar} seed={p.name} robot={p.bot} size={i === 0 ? 130 : 104} />,
          tag: p.bot ? <span className="chip border-transparent bg-ai text-[12px] text-on-ai">{t('common.ai')}</span> : undefined,
        }))} />
      ) : <p className="display m-auto text-center text-[44px] text-muted">{t('final.noDetectives')}</p>}
    </main>
  )
}

/** Die besten Antworten noch einmal abspielen: Frage, Antwort, dann wer es war. */
function FinalReplay({ view }: { view: View }) {
  const f = view.final
  const cards = [
    ...(f?.funniest ?? []).map((a, i) => ({ a, label: i === 0 ? t('final.funniest') : t('final.funnyRank', { n: i + 1 }), meta: tn('final.laughs', a.funVotes) })),
    ...(f?.disguise ? [{ a: f.disguise, label: t('final.disguise'), meta: tn('final.aiVotes', f.disguise.aiVotes) }] : []),
  ]
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6">
      <h1 className="display anim-pop m-0 text-center text-[72px]">{t('final.replayTitle')}</h1>
      <div className="grid min-h-0 flex-1 auto-rows-fr gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(2, Math.max(1, cards.length))}, minmax(0, 1fr))` }}>
        {cards.map(({ a, label, meta }, i) => {
          const at = 600 + i * 1600
          return (
            <article key={`${label}-${a.letter}-${a.question}`} className="frame anim-rise flex min-h-0 flex-col gap-3 p-6" style={{ animationDelay: `${at}ms` }}>
              <span className="label text-sm">{label}</span>
              <span className="label text-[13px] text-ink">{a.question}</span>
              <p className="m-0 flex-1 text-[26px] leading-snug">„{a.text}“</p>
              <div className="anim-pop flex items-center gap-3" style={{ animationDelay: `${at + 900}ms` }}>
                <PersonAvatar p={{ id: a.authorId, name: a.name, isAi: a.isAi, avatar: a.avatar }} size={56} />
                <span className="font-display text-[26px] font-extrabold">{a.name}</span>
                <span className="stamp ml-auto text-[14px]">{meta}</span>
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}

function Confetti() {
  const [bits] = useState(() => Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 2.5, duration: 3.5 + Math.random() * 3,
    color: ['var(--ai)', 'var(--fun)', 'var(--ink)'][i % 3], size: 8 + Math.random() * 8,
  })))
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <span key={i} className="absolute -top-[5vh] block" style={{
          left: `${b.left}%`, width: b.size, height: b.size * 0.45, background: b.color,
          animation: `fall ${b.duration}s ${b.delay}s linear 2 both`,
        }} />
      ))}
    </div>
  )
}
