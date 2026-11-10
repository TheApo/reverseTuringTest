import { useState, type SyntheticEvent } from 'react'
import { Avatar, AvatarEditor } from './Avatar.tsx'
import { t } from './i18n.ts'
import { send, useGame, type View } from './socket.ts'
import { Crowd, Icon, JoinForm, Kicked, Loading, Phone, QuestionCard, RoundHeader, Score, buzz, rankOf } from './ui.tsx'

export default function Player() {
  const { view, status, online, enter } = useGame('player')
  if (status === 'kicked') return <Kicked />
  if (status === 'join') return <Phone online={online}><JoinForm role="player" onSubmit={enter} /></Phone>
  if (!view?.me) return <Phone online={online}><Loading /></Phone>
  const me = view.me
  return (
    <Phone online={online} chip={<><Avatar value={me.avatar} seed={me.name} size={24} />{me.name}</>}>
      {view.phase === 'lobby' && (
        <>
          <section className="frame anim-rise flex flex-col gap-3 p-5">
            <Avatar value={me.avatar} seed={me.name} size={96} />
            <h1 className="display m-0 text-4xl">{t('player.hello', { name: me.name })}</h1>
            <p className="m-0 text-lg">{t('player.lobby')}</p>
            <p className="m-0 text-muted">{t('player.rules')}</p>
          </section>
          <AvatarEditor value={me.avatar} seed={me.name} onChange={avatar => send('avatar', avatar)} />
          <Crowd view={view} />
        </>
      )}
      {view.phase === 'answer' && <Answering key={view.round} view={view} />}
      {view.phase === 'vote' && (
        <>
          <RoundHeader view={view} title={t('common.lookAtScreen')} />
          <QuestionCard text={view.question ?? ''} size="text-2xl" />
          <section className="frame p-5">
            <p className="m-0 text-lg">{view.mine?.letter ? t('player.voting', { letter: view.mine.letter }) : t('player.noAnswer')}</p>
          </section>
        </>
      )}
      {view.phase === 'reveal' && <RoundResult view={view} />}
      {(view.phase === 'reveal' || view.phase === 'final') && (
        <Score label={t('common.total')} points={me.points} place={rankOf(view.players, me.points)} />
      )}
      {view.phase === 'final' && <p className="display m-0 text-3xl">{t('common.lookAtScreen')}</p>}
    </Phone>
  )
}

function Answering({ view }: { view: View }) {
  const [text, setText] = useState(view.mine?.text ?? '')
  const [pasteWarn, setPasteWarn] = useState(false)
  const sent = !!view.mine?.final
  const writing = view.players.filter(p => !p.isAi && !p.done && p.id !== view.me?.id).map(p => p.name)
  // shortcut: blockiert Einfügen per Tastatur, Menü und Drag & Drop; Zwischenablage-Vorschläge mancher Handy-Tastaturen kommen als normales Tippen durch
  const block = (e: SyntheticEvent) => {
    e.preventDefault()
    setPasteWarn(true)
    buzz(40)
  }
  return (
    <>
      <RoundHeader view={view} title={t('player.mission')} />
      <QuestionCard text={view.question ?? ''} />
      {sent ? (
        <section className="frame anim-rise relative mt-2 flex flex-col gap-3 p-4 pt-8">
          <span className="stamp anim-stamp absolute -top-3 right-4 bg-card text-sm">{t('player.sent')}</span>
          <p className="m-0 pr-2 text-lg leading-snug">„{view.mine?.text}“</p>
          <p className="anim-breathe m-0 text-muted">{t('player.waitOthers')}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="answer" className="label text-ink">{t('player.yourAnswer')}</label>
            <span className="label tabular-nums">{text.length} / {view.maxChars}</span>
          </div>
          <textarea id="answer" className="field h-40 resize-none leading-snug" value={text} maxLength={view.maxChars}
            enterKeyHint="send" onPaste={block} onDrop={block}
            onChange={e => {
              setText(e.target.value)
              send('answer', { text: e.target.value, final: false })
            }} />
          <span className="bar h-1" aria-hidden="true">
            <span className={text.length / view.maxChars > 0.9 ? 'bg-ai' : 'bg-fun'}
              style={{ width: `${(text.length * 100) / view.maxChars}%`, animation: 'none', transition: 'width .2s ease, background-color .2s' }} />
          </span>
          {pasteWarn && <p role="alert" className="m-0 border-[1.5px] border-ai bg-card px-3 py-2 font-bold text-ai-text rounded-box">{t('player.pasteBlocked')}</p>}
          <p className="m-0 text-sm text-muted"><strong className="text-ink">{t('player.tipLabel')}</strong> {t('player.tip')}</p>
        </section>
      )}
      <div className="mt-auto flex flex-col gap-2">
        {writing.length > 0 && <p className="label m-0">{t('player.stillWriting', { names: writing.join(', ') })}</p>}
        {!sent && (
          <>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={() => {
              buzz(20)
              send('answer', { text, final: true })
            }}>
              {t('player.submit')} <Icon name="send" />
            </button>
            <p className="m-0 text-center text-xs text-muted">{t('player.autoSubmit')}</p>
          </>
        )}
      </div>
    </>
  )
}

function RoundResult({ view }: { view: View }) {
  const row = view.result?.answers.find(a => a.authorId === view.me?.id)
  const lines = [
    row?.bonus.includes('disguise') && t('player.result.disguise'),
    row?.bonus.includes('fun') && t('player.result.fun'),
  ].filter(Boolean)
  return (
    <section className="frame anim-rise flex flex-col gap-2 p-5">
      <span className="label">{t('common.round', { no: view.round, total: view.rounds })}</span>
      {lines.length ? lines.map(l => <p key={String(l)} className="display m-0 text-3xl">{l}</p>)
        : <p className="m-0 text-xl">{row ? t('player.result.none') : t('player.noAnswer')}</p>}
      <p className="m-0 text-muted">{t('common.lookAtScreen')}</p>
    </section>
  )
}
