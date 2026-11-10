import { useState } from 'react'
import type { Vote } from '../server/game.ts'
import { Avatar, AvatarEditor } from './Avatar.tsx'
import { t, tn } from './i18n.ts'
import { send, useGame, type View } from './socket.ts'
import { Crowd, Icon, JoinForm, Kicked, Loading, Phone, QuestionCard, RoundHeader, Score, buzz } from './ui.tsx'

export default function Audience() {
  const { view, status, online, enter } = useGame('audience')
  if (status === 'kicked') return <Kicked />
  if (status === 'join') return <Phone online={online}><JoinForm role="audience" onSubmit={enter} /></Phone>
  if (!view?.me) return <Phone online={online}><Loading /></Phone>
  const me = view.me
  return (
    <Phone online={online} chip={<><Avatar value={me.avatar} seed={me.name} size={24} />{me.name}</>}>
      {view.phase === 'lobby' && (
        <section className="frame anim-rise flex flex-col gap-3 p-5">
          <Avatar value={me.avatar} seed={me.name} size={96} />
          <h1 className="display m-0 text-4xl">{t('audience.hello', { name: me.name })}</h1>
          <p className="m-0 text-lg">{t('audience.lobby')}</p>
          <p className="m-0 text-muted">{t('audience.how')}</p>
        </section>
      )}
      {view.phase === 'lobby' && <AvatarEditor value={me.avatar} seed={me.name} onChange={avatar => send('avatar', avatar)} />}
      {(view.phase === 'lobby' || view.phase === 'answer') && <Crowd view={view} />}
      {view.phase === 'answer' && (
        <>
          <RoundHeader view={view} title={t('audience.writing')} />
          <QuestionCard text={view.question ?? ''} />
          <p className="label m-0">{tn('audience.aiPlaying', view.aiCount)}</p>
        </>
      )}
      {view.phase === 'vote' && <Voting key={view.round} view={view} />}
      {view.phase === 'reveal' && <RoundResult view={view} />}
      {view.phase !== 'lobby' && view.phase !== 'vote' && view.phase !== 'answer' && (
        <Score label={t('audience.detectivePoints')} points={me.points} place={view.phase === 'final' && me.points > 0 ? me.rank : undefined} />
      )}
      {view.phase === 'final' && <p className="display m-0 text-3xl">{t('common.lookAtScreen')}</p>}
    </Phone>
  )
}

function Voting({ view }: { view: View }) {
  const [vote, setVote] = useState<Vote>(view.myVote ?? { ai: [], fun: null })
  const k = view.aiCount
  const open = view.votingOpen
  const [saves, setSaves] = useState(0)
  const update = (next: Vote) => {
    buzz(10)
    setVote(next)
    setSaves(n => n + 1)
    send('vote', next)
  }
  // Bei k KIs: neue Auswahl verdrängt die älteste
  const toggleAi = (l: string) => update({ ...vote, ai: vote.ai.includes(l) ? vote.ai.filter(x => x !== l) : [...vote.ai, l].slice(-k) })
  const toggleFun = (l: string) => update({ ...vote, fun: vote.fun === l ? null : l })
  return (
    <>
      <RoundHeader view={view} title={tn('audience.aiPlaying', k)} />
      <h1 className="display m-0 text-2xl">{view.question}</h1>
      <p className="m-0 text-sm text-muted">{open ? tn('audience.instructions', k) : t('audience.closed')}</p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {view.answers?.map(a => {
          const isAi = vote.ai.includes(a.letter), isFun = vote.fun === a.letter
          return (
            <li key={a.letter} className={`card grid grid-cols-[minmax(0,1fr)_62px] gap-2.5 p-2.5 pl-3.5 transition-colors duration-200 ${isAi ? 'tint-ai' : isFun ? 'tint-fun' : ''}`}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="label text-[11px]">{t('common.answer', { letter: a.letter })}</span>
                <p className="m-0 text-[15px] leading-snug">{a.text}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {k > 0 && (
                  <button type="button" disabled={!open} aria-pressed={isAi} aria-label={t('audience.markAi', { letter: a.letter })}
                    onClick={() => toggleAi(a.letter)}
                    className={`btn label min-h-12 flex-col gap-0.5 px-0 text-[10px] ${isAi ? 'border-ai bg-ai text-on-ai' : 'text-ink'}`}>
                    <Icon name="ai" size={18} />{t('audience.btnAi')}
                  </button>
                )}
                <button type="button" disabled={!open} aria-pressed={isFun} aria-label={t('audience.markFun', { letter: a.letter })}
                  onClick={() => toggleFun(a.letter)}
                  className={`btn label min-h-12 flex-col gap-0.5 px-0 text-[10px] ${isFun ? 'border-fun bg-fun text-on-fun' : 'text-ink'}`}>
                  <Icon name="fun" size={18} />{t('audience.btnFun')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="label m-0 text-center">{t('crowd.voted', { n: view.voters, total: view.audience })}</p>
      <footer className="label mt-auto flex justify-between gap-2 border-t-2 border-rule pt-2.5 text-ink">
        <span>{t('audience.btnAi')}: {vote.ai.join(', ') || '–'}</span>
        <span>{t('audience.btnFun')}: {vote.fun ?? '–'}</span>
        <span key={saves} className={`flex items-center gap-1 text-muted ${saves ? 'anim-pop' : ''}`}>{saves > 0 && <Icon name="check" size={14} />}{t('audience.saved')}</span>
      </footer>
    </>
  )
}

function RoundResult({ view }: { view: View }) {
  const r = view.result
  if (!r) return null
  const hits = r.deltas[view.me!.id] ?? 0
  const aiLetters = r.answers.filter(a => a.isAi).map(a => a.letter).join(', ')
  const text = !view.myVote ? t('audience.result.noVote') : hits ? t('audience.result.hit', { n: hits }) : t('audience.result.miss', { letters: aiLetters })
  return (
    <section className="frame anim-rise flex flex-col gap-2 p-5">
      <span className="label">{t('common.round', { no: view.round, total: view.rounds })}</span>
      <p className="display m-0 text-3xl">{text}</p>
      <p className="m-0 text-muted">{t('common.lookAtScreen')}</p>
    </section>
  )
}
