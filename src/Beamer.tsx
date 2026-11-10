import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ResultAnswer } from '../server/game.ts'
import { Avatar, PersonAvatar } from './Avatar.tsx'
import { setLang, t, tn } from './i18n.ts'
import { useGame, type View } from './socket.ts'
import { SOUNDS, play, soundReady, unlockSound } from './sound.ts'
import { Brand, Icon, Qr, clock, rankOf, secondsLeft, setTheme, timerClass, useNow } from './ui.tsx'

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

/** Spalten und Schriftgröße passend zur Zahl der Antworten. */
const gridFor = (n: number): { style: CSSProperties; font: number } =>
  n <= 4 ? { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, font: 26 }
    : n <= 6 ? { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, font: 22 }
      : { style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }, font: 19 }

function Lobby({ view }: { view: View }) {
  const humans = view.players.filter(p => !p.isAi)
  const urls = joinUrls(view)
  return (
    <>
      <Top view={view} />
      <main className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12">
        <JoinCard title={t('beamer.joinPlayer')} hint={t('beamer.joinPlayerHint')} url={urls.player} size={300} />
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="label text-base">{t('beamer.waiting')}</span>
          <h1 className="display m-0 text-[96px]">{t('app.headline')}</h1>
          <p className="m-0 max-w-[560px] text-[26px] leading-snug text-muted">{t('app.tagline')}</p>
          <div className="flex flex-col items-center gap-3">
            <span className="label text-base">{t('beamer.slots', { n: humans.length, max: view.maxPlayers })} · {tn('audience.aiPlaying', view.aiCount)}</span>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-3 p-0">
              {humans.map(p => <li key={p.id} className="anim-pop chip bg-card py-1.5 pr-4 pl-2 font-display text-[24px] tracking-normal normal-case"><PersonAvatar p={p} size={44} />{p.name}</li>)}
            </ul>
          </div>
          <Crowd view={view} />
        </div>
        <JoinCard title={t('beamer.joinAudience')} hint={t('beamer.joinAudienceHint')} url={urls.audience} size={300} />
      </main>
    </>
  )
}

/** Die Gesichter im Publikum, damit jede:r sich auf dem Beamer wiederfindet. */
function Crowd({ view }: { view: View }) {
  if (!view.crowd.length) return null
  const n = view.crowd.length
  const size = n <= 12 ? 64 : n <= 30 ? 48 : 36 // wenige groß, viele kleiner, damit alle aufs Bild passen
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="label text-sm">{tn('beamer.audienceCount', view.audience)}</span>
      <ul className="m-0 flex max-w-[680px] list-none flex-wrap justify-center gap-1.5 p-0">
        {view.crowd.map(p => <li key={p.id} title={p.name} className="anim-pop"><Avatar value={p.avatar} seed={p.name} size={size} label={p.name} /></li>)}
        {view.audience > view.crowd.length && <li className="label grid h-10 place-items-center px-2 text-ink">+{view.audience - view.crowd.length}</li>}
      </ul>
    </div>
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
  return (
    <>
      <Top view={view} right={tn('beamer.votes', view.voters)} />
      <section className="flex flex-col gap-1.5">
        <span className="label text-sm">{t('beamer.voteNow')} · {tn('audience.aiPlaying', view.aiCount)}</span>
        <h1 className="display m-0 text-[54px]">{view.question}</h1>
      </section>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-9">
        <div className="grid min-h-0 auto-rows-fr gap-5" style={grid.style}>
          {answers.map((a, i) => (
            <article key={a.letter} className="card anim-rise flex min-h-0 flex-col gap-3 p-5" style={{ animationDelay: `${i * 120}ms` }}>
              <Letter letter={a.letter} />
              <p className="m-0 leading-snug" style={{ fontSize: grid.font }}>{a.text}</p>
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

function ResultCard({ a, i, voters, font }: { a: ResultAnswer; i: number; voters: number; font: number }) {
  const pct = (n: number) => `${voters ? (n * 100) / voters : 0}%`
  const tag = 600 + i * 350
  return (
    <article className={`card anim-rise flex min-h-0 flex-col gap-3 p-5 ${a.isAi ? 'border-[3px] border-ai' : ''}`} style={{ animationDelay: `${i * 120}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <Letter letter={a.letter} />
        <span className={`chip anim-pop py-0.5 pl-1 text-[14px] ${a.isAi ? 'border-transparent bg-ai text-on-ai' : 'border-transparent bg-fun text-on-fun'}`} style={{ animationDelay: `${tag}ms` }}>
          <PersonAvatar p={{ id: a.authorId, name: a.name, isAi: a.isAi, avatar: a.avatar }} size={30} />
          {a.isAi ? t('common.ai') : t('common.human')} · {a.name}
        </span>
      </div>
      <p className="m-0 flex-1 leading-snug" style={{ fontSize: font }}>{a.text}</p>
      {a.bonus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.bonus.map(b => <span key={b} className="stamp anim-pop text-[15px]" style={{ animationDelay: `${tag + 1400}ms` }}>{t(b === 'fun' ? 'bonus.fun' : 'bonus.disguise')}</span>)}
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
    </article>
  )
}

function Reveal({ view }: { view: View }) {
  const r = view.result
  if (!r) return null
  const grid = gridFor(r.answers.length)
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
        <div className="grid min-h-0 auto-rows-fr gap-5" style={grid.style}>
          {r.answers.map((a, i) => <ResultCard key={a.letter} a={a} i={i} voters={r.voters} font={grid.font - 2} />)}
        </div>
        <aside className="flex min-h-0 flex-col gap-4">
          <section className="frame anim-rise flex flex-col gap-1 p-5" style={{ animationDelay: `${late}ms` }}>
            <span className="label text-sm">{t('beamer.standings')}</span>
            <ol className="m-0 flex list-none flex-col p-0">
              {view.players.slice(0, 6).map(p => (
                <li key={p.id} className="grid grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line py-1.5 last:border-0">
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

function Detectives({ view, delay }: { view: View; delay: number }) {
  if (!view.detectives.length) return null
  return (
    <section className="card anim-rise flex flex-col gap-2 p-5" style={{ animationDelay: `${delay}ms` }}>
      <span className="label text-sm">{t('beamer.detectives')}</span>
      {view.detectives.map(d => (
        <div key={d.name} className="flex items-center justify-between text-[19px] font-semibold">
          <span className="flex items-center gap-2"><Avatar value={d.avatar} seed={d.name} size={32} />{d.name}</span><span className="label text-sm">{tn('beamer.hits', d.points)}</span>
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
      <span className="label text-center text-base">{t('phase.final')}</span>
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
  const d = view.detectives
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4">
      {d.length > 0 && <Confetti />}
      <span className="label text-center text-base">{t('final.detectivesSub')}</span>
      <h1 className="display anim-pop m-0 text-center text-[92px]">{t('final.detectivesTitle')}</h1>
      {d.length ? (
        <Podium unit={n => tn('beamer.hits', n)} entries={d.map((p, i) => ({
          id: p.name, name: p.name, points: p.points, avatar: <Avatar value={p.avatar} seed={p.name} size={i === 0 ? 130 : 104} />,
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
