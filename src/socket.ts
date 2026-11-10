import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import type { View as GameView } from '../server/game.ts'

export type Role = 'beamer' | 'admin' | 'player' | 'audience'
/** Zustand vom Server plus Empfangszeit (für den Countdown, unabhängig von der Handy-Uhr). */
export type View = GameView & { joinUrl: string; keys: Record<string, boolean> | null; at: number }
type Reply = { ok?: true; token?: string; error?: string }

export const socket = io({ autoConnect: false })
export const send = (event: string, data?: unknown) => new Promise<Reply>(resolve => socket.emit(event, data, resolve))
export const admin = (type: string, args: Record<string, unknown> = {}) => send('admin', { type, ...args })

// ?slot=2 trennt Identitäten im selben Browser, damit man allein mehrere Spieler testen kann
const SLOT = new URLSearchParams(location.search).get('slot')?.replace(/\W/g, '').slice(0, 12)
const TOKEN = (role: Role) => `rtt-token-${role}${SLOT ? `-${SLOT}` : ''}`
const PASSWORD = 'rtt-admin'

export function useGame(role: Role) {
  const [view, setView] = useState<View | null>(null)
  const [status, setStatus] = useState<'connecting' | 'ready' | 'join' | 'kicked'>('connecting')
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const hello = async () => {
      setOnline(true)
      const r = await send('hello', { role, token: localStorage.getItem(TOKEN(role)), password: localStorage.getItem(PASSWORD) })
      setStatus(r.ok ? 'ready' : 'join')
    }
    const onState = (v: GameView) => setView({ ...(v as View), at: Date.now() })
    const onKicked = () => {
      localStorage.removeItem(TOKEN(role))
      setStatus('kicked')
    }
    const onDown = () => setOnline(false)
    socket.on('connect', hello).on('state', onState).on('kicked', onKicked).on('disconnect', onDown)
    socket.connect()
    return () => {
      socket.off('connect', hello).off('state', onState).off('kicked', onKicked).off('disconnect', onDown)
      socket.disconnect()
    }
  }, [role])

  /** Beitreten (Name und Avatar) bzw. Admin-Login (Passwort). Gibt bei Fehler den i18n-Key zurück. */
  const enter = async (value: string, avatar?: unknown) => {
    const r = role === 'admin' ? await send('hello', { role, password: value }) : await send('join', { role, name: value, avatar })
    if (r.error) return r.error
    if (r.token) localStorage.setItem(TOKEN(role), r.token)
    if (role === 'admin') localStorage.setItem(PASSWORD, value)
    setStatus('ready')
  }

  /** Abmelden: Zugang im Browser vergessen und neu verbinden, der Server sieht dann keinen Admin mehr. */
  const logout = () => {
    localStorage.removeItem(role === 'admin' ? PASSWORD : TOKEN(role))
    setView(null)
    socket.disconnect().connect()
  }

  return { view, status, online, enter, logout }
}
