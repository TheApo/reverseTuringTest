import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { getLang, setLang, t, tError, tn } from './i18n.ts'
import type { Avatar as AvatarValue } from '../server/game.ts'
import { Avatar, AvatarBuilder, randomAvatar } from './Avatar.tsx'
import type { View } from './socket.ts'

// ---------- Design (hell/dunkel) ----------
export type Theme = 'light' | 'dark'
export const getTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
export function setTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme
  if (!persist) return
  localStorage.setItem('rtt-theme', theme)
  dispatchEvent(new Event('rtt-prefs'))
}

// ---------- Gefühl ----------
/** Kurzes Vibrieren als Bestätigung (Android; iOS ignoriert es). */
export const buzz = (ms = 12) => void navigator.vibrate?.(ms)
/** Eine Feder für alles, was sich bewegt: schnell, mit kleinem Überschwingen. */
export const SPRING = { type: 'spring', stiffness: 520, damping: 36, mass: 0.8 } as const
/** Timer-Klassen: pausiert pulsiert, die letzten 10 Sekunden schlagen in Signalfarbe. */
export const timerClass = (s: number, paused: boolean) => (paused ? 'anim-pulse' : s <= 10 ? 'anim-urgent' : '')

// ---------- Zeit ----------
export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
export function secondsLeft(v: View, now: number) {
  if (v.endsIn == null) return null
  return Math.ceil((v.paused ? v.endsIn : Math.max(0, v.endsIn - (now - v.at))) / 1000)
}
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
/** Platz mit Gleichstand: gleiche Punkte, gleicher Platz. */
export const rankOf = (list: { points: number }[], points: number) => 1 + list.filter(p => p.points > points).length

// ---------- Icons ----------
const PATHS = {
  ai: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9.5 17h5" /></>,
  fun: <><circle cx="12" cy="12" r="9" /><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 5M22 9l-5 5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  send: <path d="M5 12h13M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  shuffle: <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.9-3.6M14.1 9.6C15.2 8 16.4 7 17 7h3M18 4l3 3-3 3M18 14l3 3-3 3" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  down: <path d="M6 9l6 6 6-6" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" strokeWidth={3} /></>,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3.2} />,
  plus: <path d="M12 5v14M5 12h14" />,
}
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {PATHS[name]}
    </svg>
  )
}

// ---------- QR-Code (immer dunkel auf weiß, damit jede Kamera ihn liest) ----------
export function Qr({ url, size }: { url: string; size: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000064', light: '#FFFFFF' } }).then(setSvg)
  }, [url])
  return <div role="img" aria-label={url} className="shrink-0 bg-white p-2 [&>svg]:block [&>svg]:size-full"
    style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}

// ---------- Marke ----------
// Logo-Datei liegt in public/brand/ (SVG oder PNG mit transparentem Hintergrund). Fehlt sie, bleibt nur der Text.
const LOGOS = ['/brand/logo.svg', '/brand/logo.png']
export function Brand({ big = false }: { big?: boolean }) {
  const [src, setSrc] = useState(0)
  const hasLogo = src < LOGOS.length
  return (
    <div className="flex min-w-0 items-center gap-3">
      {hasLogo
        ? <img src={LOGOS[src]} alt="bms corporate solutions" onError={() => setSrc(src + 1)} className={`logo w-auto ${big ? 'h-9' : 'h-5'}`} />
        : <span className="size-2.5 shrink-0 rounded-pill bg-ai" />}
      <span className={`label truncate text-ink ${big ? 'text-[15px]' : ''} ${big && hasLogo ? 'border-l-2 border-rule pl-3' : ''} ${hasLogo && !big ? 'hidden sm:inline' : ''}`}>{t('app.name')}</span>
    </div>
  )
}

// ---------- Handy-Rahmen ----------
export function PrefButtons() {
  const dark = getTheme() === 'dark'
  return (
    <div className="flex gap-2">
      <button type="button" className="btn min-h-10 px-3 text-sm" onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}
        aria-label={t('common.switchLanguage')}>{getLang() === 'de' ? 'EN' : 'DE'}</button>
      <button type="button" className="btn min-h-10 px-3" onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={t(dark ? 'common.themeLight' : 'common.themeDark')}><Icon name={dark ? 'sun' : 'moon'} size={18} /></button>
    </div>
  )
}

/** wide: Admin am Desktop nutzt bis 1280 px Breite, Spieler und Publikum bleiben handybreit. */
export function Phone({ children, chip, online = true, wide = false }: { children: ReactNode; chip?: ReactNode; online?: boolean; wide?: boolean }) {
  return (
    <div className={'mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-4 pb-6 ' + (wide ? 'lg:max-w-[1280px] lg:gap-6 lg:px-8 lg:pt-6' : '')}>
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-2">
          {chip && <span className="chip max-w-40 truncate bg-card py-1 pl-1.5 normal-case tracking-normal">{chip}</span>}
          <PrefButtons />
        </div>
      </header>
      {!online && <p role="status" className="chip m-0 justify-center bg-ai text-on-ai">{t('common.offline')}</p>}
      {children}
    </div>
  )
}

/** Kopf einer Runde auf dem Handy: Rundenzahl, Auftrag, Restzeit, Fortschrittsbalken. */
export function RoundHeader({ view, title }: { view: View; title: string }) {
  const s = secondsLeft(view, useNow())
  const pct = s == null ? 0 : Math.min(100, (s * 1000 * 100) / view.duration)
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3 border-b-2 border-rule pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label">{t('common.round', { no: view.round, total: view.rounds })}</span>
          <span className="font-display text-lg font-bold">{title}</span>
        </div>
        {s != null && (
          <div className="flex flex-col items-end gap-1">
            <span className="label">{view.paused ? t('common.paused') : t('common.timeLeft')}</span>
            <span role="timer" className={`num text-5xl ${timerClass(s, view.paused)}`}>{clock(s)}</span>
          </div>
        )}
      </div>
      {s != null && <span className="bar h-1.5"><span className="bg-ai" style={{ width: `${pct}%`, animation: 'none', transition: 'width .25s linear' }} /></span>}
    </section>
  )
}

export function QuestionCard({ text, size = 'text-[28px]' }: { text: string; size?: string }) {
  return (
    <section className="card flex flex-col gap-2 p-4">
      <span className="label">{t('common.question')}</span>
      <h1 className={`display m-0 ${size}`}>{text}</h1>
    </section>
  )
}

/** Name-Eingabe zum Beitreten bzw. Passwort für den Admin. */
export function JoinForm({ role, onSubmit }: { role: 'player' | 'audience' | 'admin'; onSubmit: (v: string, avatar?: AvatarValue) => Promise<string | undefined> }) {
  const [value, setValue] = useState('')
  const [avatar, setAvatar] = useState(randomAvatar)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = role === 'admin'
  const title = isAdmin ? t('admin.login') : role === 'player' ? t('join.title.player') : t('join.title.audience')
  return (
    <form className="frame flex flex-col gap-4 p-5" onSubmit={async e => {
      e.preventDefault()
      setBusy(true)
      const err = await onSubmit(value.trim(), isAdmin ? undefined : avatar)
      if (!err) buzz(20)
      setBusy(false)
      setError(err ? tError(err) : '')
    }}>
      <h1 className="display m-0 text-4xl">{title}</h1>
      {!isAdmin && <p className="m-0 text-muted">{role === 'player' ? t('join.intro.player') : t('join.intro.audience')}</p>}
      <label className="flex flex-col gap-2">
        <span className="label text-ink">{isAdmin ? t('admin.password') : t('join.name')}</span>
        <input className="field" value={value} onChange={e => setValue(e.target.value)} required autoFocus
          type={isAdmin ? 'password' : 'text'} maxLength={isAdmin ? 200 : 20} autoComplete={isAdmin ? 'current-password' : 'nickname'} />
      </label>
      {!isAdmin && <AvatarBuilder value={avatar} onChange={setAvatar} />}
      {error && <p role="alert" className="m-0 font-bold text-ai-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !value.trim()}>{isAdmin ? t('admin.signIn') : t('join.submit')}</button>
    </form>
  )
}

export function Kicked() {
  return (
    <Phone>
      <section className="frame flex flex-col gap-4 p-5">
        <p className="m-0 text-lg">{t('common.kicked')}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>{t('common.rejoin')}</button>
      </section>
    </Phone>
  )
}

/** Wer ist dabei: Zahlen und die Köpfe von Spielern und Publikum, damit man sieht, wie viele mitmachen. */
export function Crowd({ view }: { view: View }) {
  const humans = view.players.filter(p => !p.isAi)
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label text-ink">{t('crowd.title')}</span>
        <span className="label">{t('crowd.summary', { players: humans.length, audience: view.audience })}</span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {[...humans, ...view.crowd].map(p => (
          <li key={p.id} title={p.name} className="anim-pop"><Avatar value={p.avatar} seed={p.name} size={34} label={p.name} /></li>
        ))}
        {view.audience > view.crowd.length && <li className="label grid h-[34px] place-items-center px-1 text-ink">+{view.audience - view.crowd.length}</li>}
      </ul>
    </section>
  )
}

export const Loading = () => <p className="label m-0 anim-pulse">{t('common.connecting')}</p>

/** Punktestand mit Platz, für Spieler und Publikum. */
export function Score({ label, points, place }: { label: string; points: number; place?: number }) {
  return (
    <section className="frame flex items-end justify-between gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="label">{label}</span>
        {place && <span className="font-display text-xl font-bold">{t('common.place', { n: place })}</span>}
      </div>
      <span className="num text-5xl" aria-label={tn('common.points', points)}>{points}</span>
    </section>
  )
}
