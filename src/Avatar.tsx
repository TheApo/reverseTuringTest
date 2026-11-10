import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { AVATAR_PARTS, type Avatar as AvatarValue, type AvatarPart } from '../server/game.ts'
import { t, type Key } from './i18n.ts'
import { Icon, SPRING, buzz } from './ui.tsx'

// Feste Farben (unabhängig vom Design), damit jeder Avatar überall gleich aussieht.
const INK = '#000064', LIGHT = '#F7F8F7'
const RED = '#B8004C', TEAL = '#0096A0', LATTE = '#F8EAD6', LILAC = '#D1D1FE', WHITE = '#FFFFFF', GREY = '#A0A0A0'
// Markenfarben, dann fünf Hauttöne. dark = Augen und Mund werden hell gezeichnet.
const COLORS: { fill: string; dark?: boolean }[] = [
  { fill: TEAL }, { fill: LILAC }, { fill: LATTE }, { fill: RED, dark: true }, { fill: WHITE }, { fill: GREY },
  { fill: '#F6D7BE' }, { fill: '#E5B48C' }, { fill: '#C68A5C' }, { fill: '#8D5A3B', dark: true }, { fill: '#5C3A26', dark: true },
]

const SHAPES: ((fill: string) => ReactNode)[] = [
  f => <circle cx="50" cy="60" r="30" fill={f} />,
  f => <rect x="21" y="31" width="58" height="58" rx="16" fill={f} />,
  f => <ellipse cx="50" cy="60" rx="25" ry="31" fill={f} />,
  f => <path fill={f} d="M50 30c11 0 18 6 21 12 8 3 11 11 9 19 4 9-1 18-9 21-6 6-15 8-21 4-8 4-17 2-22-5-8-3-11-12-8-20-3-8 1-17 9-20 5-7 12-11 21-11z" />,
  f => <path fill={f} d="M50 25c15 15 29 29 29 42a29 29 0 0 1-58 0c0-13 14-27 29-42z" />,
  f => <path fill={f} d="M50 29 77 44v31L50 90 23 75V44z" />,
  f => <path fill={f} d="M50 28c9 0 14 8 14 16 0 6 14 12 14 26a28 28 0 0 1-56 0c0-14 14-20 14-26 0-8 5-16 14-16z" />,
  f => <ellipse cx="50" cy="62" rx="35" ry="27" fill={f} />,
]

const smile = <path d="M40 68q10 9 20 0" fill="none" />
const dots = <><circle cx="41" cy="57" r="3.5" fill="currentColor" stroke="none" /><circle cx="59" cy="57" r="3.5" fill="currentColor" stroke="none" /></>
const heartAt = (x: number, y: number, s = 1.25) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 7-7 0a4 4 0 0 1 7-5 4 4 0 0 1 7 5z" fill={RED} stroke={INK} strokeWidth={2.2} />
const starAt = (x: number) => <path transform={`translate(${x} 57)`} d="M0-10 3-3.2l7.5.3-5.8 4.6 2 7.3L0 4.8-6.7 9l2-7.3-5.8-4.6 7.5-.3z" fill={TEAL} stroke={INK} strokeWidth={2.2} />

// Gesichter nutzen currentColor, damit sie auf dunklen Köpfen hell werden
const FACES: ReactNode[] = [
  <>{dots}{smile}</>,
  <><circle cx="41" cy="56" r="3.5" fill="currentColor" stroke="none" /><circle cx="59" cy="56" r="3.5" fill="currentColor" stroke="none" /><path d="M37 65h26q-2 14-13 14t-13-14z" fill="currentColor" /><path d="M44 74q6-4 12 0" stroke={RED} strokeWidth={3} fill="none" /></>,
  <><path d="M35 57h11M54 57h11" /><path d="M42 71q9 3 16-4" fill="none" /></>,
  <><circle cx="41" cy="56" r="5" fill={WHITE} stroke={INK} /><circle cx="59" cy="56" r="5" fill={WHITE} stroke={INK} /><circle cx="41" cy="56" r="2" fill={INK} stroke="none" /><circle cx="59" cy="56" r="2" fill={INK} stroke="none" /><circle cx="50" cy="72" r="4.5" fill="currentColor" /></>,
  <><path d="M35 58q6-6 12 0" fill="none" /><circle cx="59" cy="57" r="3.5" fill="currentColor" stroke="none" />{smile}</>,
  <>{dots}<path d="M40 67h20" /><path d="M45 67v5a5 5 0 0 0 10 0v-5" fill={RED} stroke={INK} strokeWidth={2.5} /></>,
  <><path d="M35 56q6 5 12 0M53 56q6 5 12 0" fill="none" /><path d="M45 71h10" /></>,
  <>{heartAt(41, 55, 1)}{heartAt(59, 55, 1)}{smile}</>,
  <>{dots}<path d="M35 49h10M54 47l11-4" /><path d="M42 72l16-3" /></>,
]

const GLASSES: ReactNode[] = [
  null,
  <g fill="none"><circle cx="40" cy="57" r="9" /><circle cx="60" cy="57" r="9" /><path d="M49 56h2M31 55l-6-2M69 55l6-2" /></g>,
  <path fill={INK} stroke={INK} d="M27 51h46v4c0 8-6 11-11 11s-10-4-10-9h-4c0 5-5 9-10 9s-11-3-11-11z" />,
  <g fill="none" strokeWidth={4}><rect x="30" y="50" width="17" height="14" rx="3" /><rect x="53" y="50" width="17" height="14" rx="3" /><path d="M47 56h6" /></g>,
  <>{heartAt(40, 56)}{heartAt(60, 56)}<path d="M47 56h6" fill="none" /></>,
  <g fill="none"><circle cx="59" cy="57" r="9" /><path d="M67 62q7 9 3 22" strokeWidth={2} /></g>,
  <>{starAt(40)}{starAt(60)}<path d="M48 56h4" fill="none" /></>,
  <><path d="M20 56h60" stroke={INK} strokeWidth={5} /><path fill={TEAL} stroke={INK} d="M29 49h42a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H57l-7-5-7 5H29a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6z" /><path d="M31 53h10" stroke={WHITE} strokeWidth={2.5} /></>,
  <><path d="M27 46q20 3 40 11" stroke={INK} fill="none" strokeWidth={2.5} /><ellipse cx="59" cy="57" rx="8" ry="7" fill={INK} stroke={INK} /></>,
]

const HATS: ReactNode[] = [
  null,
  // Weihnachtsmütze
  <><path fill={RED} d="M26 36C30 15 50 4 70 8c10 2 16 8 14 16l-8-2c-2-6-8-8-12-6 6 6 10 12 10 20z" /><rect x="21" y="31" width="58" height="10" rx="5" fill={WHITE} /><circle cx="84" cy="25" r="6.5" fill={WHITE} /></>,
  // Krone
  <><path fill={LATTE} d="M28 37 30 13l10 11 10-16 10 16 10-11 2 24z" /><circle cx="50" cy="29" r="3.5" fill={RED} strokeWidth={2} /><circle cx="37" cy="31" r="2.5" fill={TEAL} strokeWidth={2} /><circle cx="63" cy="31" r="2.5" fill={TEAL} strokeWidth={2} /></>,
  // Zylinder
  <><rect x="32" y="3" width="36" height="29" rx="3" fill={INK} /><rect x="32" y="22" width="36" height="6" fill={RED} /><rect x="20" y="30" width="60" height="7" rx="3.5" fill={INK} /></>,
  // Partyhut
  <g transform="rotate(-12 50 34)"><path fill={TEAL} d="M50 2 67 35H33z" /><circle cx="46" cy="22" r="2.5" fill={LATTE} stroke="none" /><circle cx="55" cy="27" r="2.5" fill={LATTE} stroke="none" /><circle cx="51" cy="13" r="2.5" fill={LATTE} stroke="none" /><circle cx="50" cy="3" r="4.5" fill={RED} strokeWidth={2} /></g>,
  // Rentiergeweih mit roter Nase
  <><g fill="none" strokeWidth={9}><path d="M38 34Q31 19 22 8M30 21q-9 0-15-5" /><path d="M62 34q7-15 16-26M70 21q9 0 15-5" /></g>
    <g fill="none" stroke={LATTE} strokeWidth={4.5}><path d="M38 34Q31 19 22 8M30 21q-9 0-15-5" /><path d="M62 34q7-15 16-26M70 21q9 0 15-5" /></g>
    <circle cx="50" cy="65" r="5.5" fill={RED} /></>,
  // Bommelmütze
  <><path fill={LILAC} d="M22 39c0-24 56-24 56 0z" /><rect x="20" y="33" width="60" height="10" rx="5" fill={TEAL} /><circle cx="50" cy="13" r="7" fill={LATTE} /></>,
  // Elfenmütze mit Glöckchen
  <><path fill={TEAL} d="M26 36Q28 14 8 6q38-4 66 30z" /><rect x="22" y="31" width="56" height="9" rx="4.5" fill={RED} /><circle cx="9" cy="7" r="5" fill={LATTE} /></>,
  // Basecap
  <><path fill={RED} d="M24 41c0-21 52-21 52 0z" /><path fill={INK} d="M58 38h27q3 6-4 7H58z" /><circle cx="50" cy="20" r="3" fill={INK} /></>,
  // Kopfhörer
  <><path d="M22 56a28 28 0 0 1 56 0" fill="none" strokeWidth={6} /><rect x="13" y="47" width="13" height="22" rx="6" fill={TEAL} /><rect x="74" y="47" width="13" height="22" rx="6" fill={TEAL} /></>,
  // Haarschleife
  <><path fill={RED} d="M37 31 22 22v18zM37 31l15-9v18z" /><circle cx="37" cy="31" r="4.5" fill={RED} /></>,
  // Heiligenschein
  <><ellipse cx="50" cy="16" rx="22" ry="6" fill="none" strokeWidth={8} /><ellipse cx="50" cy="16" rx="22" ry="6" fill="none" stroke={LATTE} strokeWidth={4} /></>,
]

// Extras liegen unter Gesicht und Brille, damit Mund und Augen sichtbar bleiben
const EXTRAS: ReactNode[] = [
  null,
  <path fill={INK} stroke={INK} strokeWidth={2} d="M37 66c4-6 9-5 13-1 4-4 9-5 13 1-4 3-9 4-13 1-4 3-9 2-13-1z" />,
  <path fill={WHITE} d="M23 60c0 21 12 33 27 33s27-12 27-33c-7 7-15 9-27 9s-20-2-27-9z" />,
  <><path fill={RED} d="M27 84h46v9H27z" /><path fill={RED} d="M60 88h9v12h-9z" /><path d="M60 94h9" stroke={TEAL} strokeWidth={3} /></>,
  <><path fill={RED} d="M50 93 39 87v13zM50 93l11-6v13z" /><circle cx="50" cy="93" r="3.5" fill={RED} /></>,
  <><circle cx="32" cy="66" r="5" fill="#F2B8C6" stroke="none" /><circle cx="68" cy="66" r="5" fill="#F2B8C6" stroke="none" /></>,
  <g fill="currentColor" stroke="none"><circle cx="37" cy="64" r="1.4" /><circle cx="41" cy="67" r="1.4" /><circle cx="43" cy="63" r="1.4" /><circle cx="57" cy="63" r="1.4" /><circle cx="59" cy="67" r="1.4" /><circle cx="63" cy="64" r="1.4" /></g>,
]

/** Roboterköpfe für die KIs, je Anbieter eine eigene Farbe. */
const ROBOT_COLORS: Record<string, string> = { claude: LATTE, openai: TEAL, gemini: LILAC }
const robot = (fill: string) => (
  <>
    <path d="M50 31V17" fill="none" /><circle cx="50" cy="14" r="5" fill={RED} />
    <rect x="15" y="52" width="8" height="16" rx="3" fill={fill} /><rect x="77" y="52" width="8" height="16" rx="3" fill={fill} />
    <rect x="23" y="31" width="54" height="52" rx="12" fill={fill} />
    <rect x="32" y="46" width="12" height="10" rx="2.5" fill={INK} /><rect x="56" y="46" width="12" height="10" rx="2.5" fill={INK} />
    <rect x="36" y="64" width="28" height="9" rx="2" fill={WHITE} /><path d="M43 64v9M50 64v9M57 64v9" strokeWidth={2.5} fill="none" />
  </>
)

/** Gleicher Name → gleicher Avatar, für Spielstände von vor dem Baukasten. */
function fromSeed(seed: string): AvatarValue {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const pick = (part: AvatarPart) => (h = Math.imul(h, 2654435761) >>> 0) % AVATAR_PARTS[part]
  return Object.fromEntries((Object.keys(AVATAR_PARTS) as AvatarPart[]).map(p => [p, pick(p)])) as AvatarValue
}

export const randomAvatar = (): AvatarValue => fromSeed(String(Math.random()))

export function Avatar({ value, seed = '', robot: robotId, size = 40, label }: {
  value?: AvatarValue | null; seed?: string; robot?: string; size?: number; label?: string
}) {
  const a = value ?? fromSeed(seed)
  const color = COLORS[a.color] ?? COLORS[0]
  const feature = color.dark ? LIGHT : INK
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      className="shrink-0 overflow-visible">
      <g stroke={INK} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round">
        {robotId ? robot(ROBOT_COLORS[robotId] ?? LATTE) : (
          <>
            {SHAPES[a.shape]?.(color.fill)}
            <g stroke={feature} color={feature}>{EXTRAS[a.extra]}{FACES[a.face]}{GLASSES[a.glasses]}</g>
            {HATS[a.hat]}
          </>
        )}
      </g>
    </svg>
  )
}

/** Avatar für eine Person aus einer Ansicht: KIs als Roboter, alle anderen mit ihrem Baukasten-Avatar. */
export const PersonAvatar = ({ p, size }: { p: { id: string; name: string; isAi?: boolean; avatar?: AvatarValue | null }; size?: number }) =>
  <Avatar value={p.avatar} seed={p.name} robot={p.isAi ? p.id : undefined} size={size} />

const PARTS = Object.keys(AVATAR_PARTS) as AvatarPart[]

/** Baukasten: große Vorschau, Würfel, Reiter je Teil und alle Varianten als Mini-Avatare. */
export function AvatarBuilder({ value, onChange }: { value: AvatarValue; onChange: (v: AvatarValue) => void }) {
  const [part, setPart] = useState<AvatarPart>('hat')
  const choose = (v: AvatarValue) => {
    buzz(8)
    onChange(v)
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <motion.div key={PARTS.map(p => value[p]).join('-')} initial={{ scale: 0.82, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
          transition={SPRING} className="grid size-32 shrink-0 place-items-center rounded-box bg-raised">
          <Avatar value={value} size={112} label={t('avatar.title')} />
        </motion.div>
        <div className="flex flex-col items-start gap-2">
          <span className="label text-ink">{t('avatar.title')}</span>
          <p className="m-0 text-sm text-muted">{t('avatar.hint')}</p>
          <button type="button" className="btn" onClick={() => choose(randomAvatar())}><Icon name="dice" />{t('avatar.random')}</button>
        </div>
      </div>
      <div role="tablist" aria-label={t('avatar.title')} className="frame grid grid-cols-6 overflow-hidden p-0">
        {PARTS.map(p => (
          <button key={p} type="button" role="tab" aria-selected={part === p} onClick={() => setPart(p)}
            className={`label relative min-h-11 border-0 bg-transparent px-0 text-[10px] transition-colors duration-200 ${part === p ? 'text-on-strong' : 'text-ink'}`}>
            {part === p && <motion.span layoutId="avatar-tab" transition={SPRING} className="absolute inset-1 rounded-[calc(var(--r)*.6)] bg-strong" />}
            <span className="relative">{t(`avatar.tab.${p}` as Key)}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: AVATAR_PARTS[part] }, (_, i) => {
          const v = { ...value, [part]: i }
          const on = value[part] === i
          return (
            <button key={`${part}-${i}`} type="button" aria-pressed={on} aria-label={t(`avatar.${part}.${i}` as Key)} onClick={() => choose(v)}
              className={`btn aspect-square min-h-0 p-1 ${on ? 'tint-fun' : ''}`}>
              <Avatar value={v} size={56} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** In der Lobby: eigenen Avatar nachträglich ändern, jede Änderung geht sofort an den Beamer. */
export function AvatarEditor({ value, seed, onChange }: { value: AvatarValue | null; seed: string; onChange: (v: AvatarValue) => void }) {
  const [open, setOpen] = useState(false)
  const current = value ?? fromSeed(seed)
  if (!open) return (
    <button type="button" className="btn self-start" onClick={() => setOpen(true)}><Icon name="shuffle" />{t('avatar.edit')}</button>
  )
  return (
    <section className="frame anim-rise flex flex-col gap-3 p-4">
      <AvatarBuilder value={current} onChange={onChange} />
      <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>{t('avatar.done')}</button>
    </section>
  )
}
