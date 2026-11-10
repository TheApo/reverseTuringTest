import type { JSX } from 'react'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import Admin from './Admin.tsx'
import Audience from './Audience.tsx'
import Beamer from './Beamer.tsx'
import Player from './Player.tsx'
import { getLang, t, usePrefs } from './i18n.ts'
import { Icon, Phone, setTheme } from './ui.tsx'

const saved = localStorage.getItem('rtt-theme')
setTheme(saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', false)

function Home() {
  const de = getLang() === 'de'
  const link = (href: string, title: string, hint: string, primary: boolean) => (
    <a href={href} className={`btn flex-col items-start gap-1 p-5 text-left no-underline ${primary ? 'btn-primary' : ''}`}>
      <span className="flex items-center gap-2 text-2xl font-extrabold">{title} <Icon name="send" /></span>
      <span className="font-body text-base font-normal opacity-80">{hint}</span>
    </a>
  )
  return (
    <Phone>
      <section className="flex flex-col gap-3 py-6">
        <h1 className="display m-0 text-6xl">{t('app.headline')}</h1>
        <p className="m-0 text-lg text-muted">{t('app.tagline')}</p>
      </section>
      {link(de ? '/spielen' : '/play', t('home.play'), t('home.playHint'), true)}
      {link(de ? '/publikum' : '/audience', t('home.audience'), t('home.audienceHint'), false)}
    </Phone>
  )
}

const PAGES: Record<string, () => JSX.Element> = {
  '/': Home, '/beamer': Beamer, '/admin': Admin,
  '/spielen': Player, '/play': Player, '/publikum': Audience, '/audience': Audience,
}

function App() {
  usePrefs()
  const Page = PAGES[location.pathname.replace(/\/+$/, '') || '/'] ?? Home
  return <MotionConfig reducedMotion="user"><Page /></MotionConfig>
}

createRoot(document.getElementById('root')!).render(<App />)
