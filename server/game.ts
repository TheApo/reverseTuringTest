// Keine Node-Importe: Der Client importiert Typen und AI_NAMES aus dieser Datei.
export type Provider = 'claude' | 'openai' | 'gemini'
export const AI_NAMES: Record<Provider, string> = { claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' }
export type Lang = 'de' | 'en'
export type Role = 'player' | 'audience' | 'ai'
export type Phase = 'lobby' | 'answer' | 'vote' | 'reveal' | 'final'

export interface Settings {
  language: Lang
  answerSeconds: number
  voteSeconds: number
  maxChars: number
  maxPlayers: number
  aiStyle: 'natural' | 'disguised'
  ais: Provider[]
  sound: boolean
  beamerTheme: 'light' | 'dark'
  /** Themen, aus denen Zufallsfragen gezogen werden (leer = alle). */
  topics: string[]
}
export const DEFAULT_SETTINGS: Settings = {
  language: 'de', answerSeconds: 60, voteSeconds: 45, maxChars: 200, maxPlayers: 5,
  aiStyle: 'natural', ais: ['claude'], sound: true, beamerTheme: 'light', topics: [],
}
const DEFAULT_ROUNDS = 8

/** Eine Frage samt vorbereiteten KI-Ersatzantworten (eigene Fragen haben keine). */
export interface Question { q: string; ai: string[]; topic?: string }
export type Catalog = Record<Lang, Question[]>
/** Avatar-Baukasten: je Teil ein Index in die Varianten (Zeichnungen in src/Avatar.tsx). */
export const AVATAR_PARTS = { shape: 8, color: 11, face: 9, hat: 12, glasses: 9, extra: 7 } as const
export type AvatarPart = keyof typeof AVATAR_PARTS
export type Avatar = Record<AvatarPart, number>
/** Vertraut dem Client nicht: jede Zahl wird auf eine gültige Variante begrenzt, Unbekanntes wird 0. */
export function sanitizeAvatar(raw: unknown): Avatar {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries((Object.keys(AVATAR_PARTS) as AvatarPart[]).map(part => {
    const n = Math.floor(Number(input[part]))
    return [part, Number.isFinite(n) && n >= 0 && n < AVATAR_PARTS[part] ? n : 0]
  })) as Avatar
}

export interface Person { id: string; token: string; name: string; role: Role; points: number; avatar?: Avatar }
export interface Answer {
  authorId: string
  text: string
  final: boolean
  hidden: boolean
  letter: string | null
  source: 'live' | 'fallback' | 'failed' | null
  ms: number | null
}
export interface Vote { ai: string[]; fun: string | null }
export interface ResultAnswer {
  letter: string; text: string; authorId: string; name: string; isAi: boolean; avatar: Avatar | null
  aiVotes: number; funVotes: number; bonus: ('fun' | 'disguise')[]
}
export interface RoundResult {
  no: number; question: string; k: number; voters: number; caught: number
  answers: ResultAnswer[]; deltas: Record<string, number>
}
interface Round {
  no: number; question: Question
  answers: Answer[]; votes: Record<string, Vote>; votingOpen: boolean; result: RoundResult | null
}
export interface State {
  phase: Phase; settings: Settings; people: Person[]; round: Round | null
  plan: Question[]; history: RoundResult[]
  paused: boolean; endsAt: number | null; remaining: number | null
  /** Finale auf dem Beamer: 0 Podium der Spieler, 1 Detektive, 2 beste Antworten. */
  finalStep?: number
}
export type Ask = (provider: Provider, question: string, settings: Settings) => Promise<string>
export type Viewer = { role?: 'beamer' | 'admin' | 'player' | 'audience'; id?: string }

const LETTERS = 'ABCDEFGHIJKLMNOP'

/** Wertung einer Runde. k = Anzahl sichtbarer KI-Antworten. Regeln: siehe CLAUDE.md „Punkte“. */
export function score<T extends { letter: string; authorId: string; isAi: boolean }>(answers: T[], votes: Record<string, Vote>, k: number) {
  const valid = new Set(answers.map(a => a.letter))
  const aiLetters = new Set(answers.filter(a => a.isAi).map(a => a.letter))
  const aiVotes: Record<string, number> = {}
  const funVotes: Record<string, number> = {}
  const deltas: Record<string, number> = {}
  let voters = 0, caught = 0
  for (const [voter, v] of Object.entries(votes)) {
    const picks = [...new Set(v.ai)].filter(l => valid.has(l)).slice(0, k)
    const fun = v.fun && valid.has(v.fun) ? v.fun : null
    if (!picks.length && !fun) continue
    voters++
    for (const l of picks) aiVotes[l] = (aiVotes[l] ?? 0) + 1
    if (fun) funVotes[fun] = (funVotes[fun] ?? 0) + 1
    const hits = picks.filter(l => aiLetters.has(l)).length
    if (hits) deltas[voter] = hits
    if (k > 0 && hits === k) caught++
  }
  const maxFun = Math.max(0, ...Object.values(funVotes))
  // k-höchste KI-Stimmenzahl: wer mindestens so viele hat, liegt in den Top k (Gleichstand zählt mit)
  const threshold = k > 0 ? (answers.map(a => aiVotes[a.letter] ?? 0).sort((x, y) => y - x)[k - 1] ?? 0) : Infinity
  const rows = answers.map(a => {
    const ai = aiVotes[a.letter] ?? 0, fun = funVotes[a.letter] ?? 0
    const bonus: ResultAnswer['bonus'] = []
    if (maxFun > 0 && fun === maxFun) bonus.push('fun')
    if (!a.isAi && ai > 0 && ai >= threshold) bonus.push('disguise')
    const points = (bonus.includes('fun') ? 1 : 0) + (bonus.includes('disguise') ? 2 : 0)
    if (points) deltas[a.authorId] = (deltas[a.authorId] ?? 0) + points
    return { ...a, aiVotes: ai, funVotes: fun, bonus }
  })
  return { rows, deltas, voters, caught }
}

const shuffle = <T,>(list: T[]) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export class Game {
  state: State
  private online = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private catalog: Catalog
  private ask: Ask
  private onChange: () => void

  constructor(catalog: Catalog, ask: Ask, onChange: () => void, saved?: State) {
    this.catalog = catalog
    this.ask = ask
    this.onChange = onChange
    this.state = saved ?? {
      phase: 'lobby', settings: { ...DEFAULT_SETTINGS }, people: [], round: null,
      plan: [], history: [], paused: false, endsAt: null, remaining: null,
    }
    if (saved) {
      saved.settings = { ...DEFAULT_SETTINGS, ...saved.settings } // neue Einstellungen in alten Spielständen
      this.resume()
    }
    else this.drawPlan(DEFAULT_ROUNDS)
  }

  // ---------- Beitreten & Verbindung ----------

  /** Gibt die neue Person zurück oder einen i18n-Key für den Fehler. */
  join(role: 'player' | 'audience', rawName: unknown, avatar?: unknown): Person | string {
    const s = this.state
    const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)
    const taken = [...s.people.map(p => p.name), ...Object.values(AI_NAMES)].some(n => n.toLowerCase() === name.toLowerCase())
    if (!name) return 'error.nameEmpty'
    if (taken) return 'error.nameTaken'
    if (role === 'player') {
      if (s.phase !== 'lobby') return 'error.gameRunning'
      if (s.people.filter(p => p.role === 'player').length >= s.settings.maxPlayers) return 'error.playersFull'
    }
    const person: Person = { id: crypto.randomUUID(), token: crypto.randomUUID(), name, role, points: 0, avatar: sanitizeAvatar(avatar) }
    s.people.push(person)
    this.changed()
    return person
  }

  /** Avatar ändern geht nur, solange das Spiel noch nicht läuft. */
  setAvatar(id: string, avatar: unknown) {
    const p = this.person(id)
    if (this.state.phase !== 'lobby' || !p || p.role === 'ai') return
    p.avatar = sanitizeAvatar(avatar)
    this.changed()
  }

  byToken(token: unknown) {
    return this.state.people.find(p => p.role !== 'ai' && p.token === token)
  }

  connect(id: string) {
    this.online.set(id, (this.online.get(id) ?? 0) + 1)
    this.changed()
  }

  disconnect(id: string) {
    const n = (this.online.get(id) ?? 1) - 1
    if (n > 0) this.online.set(id, n)
    else this.online.delete(id)
    this.changed()
    this.checkVoteEnd()
  }

  // ---------- Spieler & Publikum ----------

  answer(id: string, text: unknown, final: boolean) {
    const r = this.state.round
    if (this.state.phase !== 'answer' || !r || this.person(id)?.role !== 'player') return
    const clean = String(text ?? '').slice(0, this.state.settings.maxChars)
    if (final && !clean.trim()) return
    let a = r.answers.find(x => x.authorId === id)
    if (a?.final) return
    if (!a) r.answers.push(a = { authorId: id, text: '', final: false, hidden: false, letter: null, source: null, ms: null })
    a.text = clean
    a.final = final
    // Entwürfe nur merken (Auto-Abschicken bei Zeitablauf), erst Abschicken verteilt den neuen Stand
    if (final) {
      this.changed()
      this.checkAnswerEnd()
    }
  }

  vote(id: string, ai: unknown, fun: unknown) {
    const r = this.state.round
    if (this.state.phase !== 'vote' || !r?.votingOpen || this.person(id)?.role !== 'audience') return
    const valid = new Set(this.visible().map(a => a.letter))
    const picks = (Array.isArray(ai) ? ai : []).map(String).filter(l => valid.has(l))
    r.votes[id] = { ai: [...new Set(picks)].slice(0, this.k()), fun: typeof fun === 'string' && valid.has(fun) ? fun : null }
    this.changed()
    this.checkVoteEnd()
  }

  // ---------- Admin ----------

  /** Führt eine Admin-Aktion aus. Rückgabe: i18n-Key bei Fehler. */
  act(type: string, args: Record<string, unknown> = {}): string | void {
    const s = this.state
    const index = Number(args.index)
    const open = Number.isInteger(index) && index >= this.played() && index < s.plan.length
    switch (type) {
      case 'settings': return this.updateSettings(args.settings as Partial<Settings>)
      case 'plan.add': {
        const custom = String(args.question ?? '').trim().slice(0, 200)
        const picked = Number.isInteger(args.catalog) ? this.questions()[args.catalog as number] : this.freeQuestion()
        const q = custom ? { q: custom, ai: [] } : picked
        if (!q || s.plan.some(p => p.q === q.q)) return 'error.questionUnavailable'
        s.plan.push(q)
        break
      }
      case 'plan.remove':
        if (!open) return
        s.plan.splice(index, 1)
        break
      case 'plan.move': { // nur innerhalb der ungespielten Fragen
        const to = Number(args.to)
        if (!open || !Number.isInteger(to) || to < this.played() || to >= s.plan.length) return
        s.plan.splice(to, 0, ...s.plan.splice(index, 1))
        break
      }
      case 'plan.reroll': {
        const q = this.freeQuestion()
        if (!open || !q) return 'error.questionUnavailable'
        s.plan[index] = q
        break
      }
      case 'plan.draw': // ungespielte Fragen neu auslosen, gleiche Anzahl
        this.drawPlan(s.plan.length - this.played())
        break
      case 'plan.set': {
        const custom = String(args.question ?? '').trim().slice(0, 200)
        if (!open || !custom) return
        if (s.plan.some(p => p.q === custom)) return 'error.questionUnavailable'
        s.plan[index] = { q: custom, ai: [] }
        break
      }
      case 'start':
        if (s.phase !== 'lobby' && s.phase !== 'reveal') return 'error.roundRunning'
        if (!s.plan[this.played()]) return 'error.noQuestions'
        return this.startRound()
      case 'pause':
        if (!s.endsAt) return
        s.remaining = Math.max(0, s.endsAt - Date.now())
        s.endsAt = null
        s.paused = true
        clearTimeout(this.timer)
        break
      case 'resume':
        if (!s.paused) return
        this.setTimer((s.remaining ?? 0) / 1000)
        break
      case 'extend':
        if (s.paused) s.remaining = (s.remaining ?? 0) + 15_000
        else if (s.endsAt) {
          s.endsAt += 15_000
          this.schedule()
        }
        break
      case 'reveal': {
        const err = this.reveal()
        if (err) return err
        break
      }
      case 'end':
        this.stopTimer()
        s.phase = 'final'
        s.finalStep = 0
        break
      case 'final.step':
        if (s.phase !== 'final') return
        s.finalStep = clamp(args.step, 0, 2, 0)
        break
      case 'reset':
        this.stopTimer()
        s.phase = 'lobby'
        s.round = null
        s.history = []
        s.people = s.people.filter(p => p.role !== 'ai')
        for (const p of s.people) p.points = 0
        break
      case 'hide': {
        const a = s.round?.answers.find(x => x.authorId === args.id)
        if (!a || (s.phase !== 'answer' && s.phase !== 'vote')) return
        a.hidden = !a.hidden
        break
      }
      case 'kick': {
        const p = this.person(String(args.id))
        if (!p || p.role === 'ai') return
        s.people = s.people.filter(x => x !== p)
        if (s.round) {
          s.round.answers = s.round.answers.filter(a => a.authorId !== p.id)
          delete s.round.votes[p.id]
        }
        this.online.delete(p.id)
        break
      }
      default: return 'error.unknownAction'
    }
    this.changed()
    if (type === 'kick') {
      this.checkAnswerEnd()
      this.checkVoteEnd()
    }
  }

  private updateSettings(patch: Partial<Settings> = {}) {
    const s = this.state.settings
    // Ton und Beamer-Design gehen jederzeit, der Rest nur in der Lobby
    if (typeof patch.sound === 'boolean') s.sound = patch.sound
    if (patch.beamerTheme === 'light' || patch.beamerTheme === 'dark') s.beamerTheme = patch.beamerTheme
    if (this.state.phase === 'lobby') {
      if (patch.answerSeconds !== undefined) s.answerSeconds = clamp(patch.answerSeconds, 15, 300, s.answerSeconds)
      if (patch.voteSeconds !== undefined) s.voteSeconds = clamp(patch.voteSeconds, 10, 300, s.voteSeconds)
      if (patch.maxChars !== undefined) s.maxChars = clamp(patch.maxChars, 50, 500, s.maxChars)
      if (patch.maxPlayers !== undefined) s.maxPlayers = clamp(patch.maxPlayers, 1, 12, s.maxPlayers)
      if (patch.aiStyle === 'natural' || patch.aiStyle === 'disguised') s.aiStyle = patch.aiStyle
      if (Array.isArray(patch.ais)) {
        const ais = (Object.keys(AI_NAMES) as Provider[]).filter(p => patch.ais!.includes(p))
        if (ais.length) s.ais = ais
      }
      if (Array.isArray(patch.topics)) s.topics = this.topics().filter(t => patch.topics!.includes(t))
      if ((patch.language === 'de' || patch.language === 'en') && patch.language !== s.language) {
        s.language = patch.language
        // Neue Sprache, neuer Katalog: Plan gleicher Länge neu auslosen
        this.drawPlan(this.state.plan.length || DEFAULT_ROUNDS)
      }
    }
    this.changed()
  }

  // ---------- Ablauf ----------

  private startRound() {
    const s = this.state
    if (s.phase === 'lobby') {
      s.people = s.people.filter(p => p.role !== 'ai')
      s.people.push(...s.settings.ais.map(p => ({ id: p, token: '', name: AI_NAMES[p], role: 'ai' as const, points: 0 })))
    }
    const no = this.played() + 1
    s.round = { no, question: s.plan[no - 1], answers: [], votes: {}, votingOpen: false, result: null }
    s.phase = 'answer'
    this.setTimer(s.settings.answerSeconds)
    this.changed()
    this.askAis()
  }

  private askAis() {
    const r = this.state.round!
    const pending = this.players().filter(p => p.role === 'ai' && !r.answers.some(a => a.authorId === p.id))
    for (const ai of pending) {
      const t0 = Date.now()
      this.ask(ai.id as Provider, r.question.q, this.state.settings)
        .then(text => this.aiAnswer(r.no, ai.id, text, Date.now() - t0))
        .catch(err => {
          console.warn(`[KI] ${ai.name}: ${err?.message ?? err}`)
          this.aiAnswer(r.no, ai.id, '', 0)
        })
    }
  }

  private aiAnswer(roundNo: number, id: string, text: string, ms: number) {
    const r = this.state.round
    if (!r || r.no !== roundNo || this.state.phase !== 'answer' || r.answers.some(a => a.authorId === id)) return
    const got = text ? { source: 'live' as const, text, ms } : { ...this.fallback(id), ms: null }
    r.answers.push({ authorId: id, final: true, hidden: false, letter: null, ...got })
    this.changed()
    this.checkAnswerEnd()
  }

  /** Ersatzantwort aus dem Katalog. Jede KI nimmt eine andere; eigene Fragen haben keine. */
  private fallback(id: string): { source: Answer['source']; text: string } {
    const text = this.state.round!.question.ai[this.state.settings.ais.indexOf(id as Provider)] ?? ''
    return text ? { source: 'fallback', text } : { source: 'failed', text: '' }
  }

  private checkAnswerEnd() {
    const r = this.state.round
    if (this.state.phase !== 'answer' || !r) return
    const done = (p: Person) => r.answers.some(a => a.authorId === p.id && a.final)
    if (this.players().every(done)) this.toVote()
  }

  private toVote() {
    const s = this.state, r = s.round!
    for (const ai of this.players().filter(p => p.role === 'ai' && !r.answers.some(a => a.authorId === p.id))) {
      r.answers.push({ authorId: ai.id, ...this.fallback(ai.id), final: true, hidden: false, letter: null, ms: null })
    }
    // Entwürfe gelten bei Zeitablauf als abgeschickt, leere fallen weg
    for (const a of r.answers) a.final = true
    const shown = shuffle(r.answers.filter(a => a.text.trim()))
    shown.forEach((a, i) => (a.letter = LETTERS[i]))
    r.answers = [...shown, ...r.answers.filter(a => !a.text.trim())]
    s.phase = 'vote'
    r.votingOpen = true
    this.setTimer(s.settings.voteSeconds)
    this.changed()
    this.checkVoteEnd()
  }

  private checkVoteEnd() {
    const r = this.state.round
    if (this.state.phase !== 'vote' || !r?.votingOpen) return
    const audience = this.state.people.filter(p => p.role === 'audience' && this.online.has(p.id))
    const k = this.k()
    const complete = (p: Person) => { const v = r.votes[p.id]; return !!v && v.ai.length === k && !!v.fun }
    if (audience.length && audience.every(complete)) this.closeVoting()
  }

  private closeVoting() {
    this.state.round!.votingOpen = false
    this.stopTimer()
    this.changed()
  }

  private reveal() {
    const s = this.state, r = s.round
    if (s.phase !== 'vote' || !r) return 'error.noVoting'
    this.stopTimer()
    const { rows, deltas, voters, caught } = score(this.visible().map(a => ({
      letter: a.letter!, text: a.text, authorId: a.authorId,
      name: this.person(a.authorId)?.name ?? '?', isAi: this.person(a.authorId)?.role === 'ai', avatar: this.person(a.authorId)?.avatar ?? null,
    })), r.votes, this.k())
    for (const [id, d] of Object.entries(deltas)) {
      const p = this.person(id)
      if (p) p.points += d
    }
    r.result = { no: r.no, question: r.question.q, k: this.k(), voters, caught, deltas, answers: rows }
    r.votingOpen = false
    s.history.push(r.result)
    s.phase = 'reveal'
  }

  // ---------- Timer ----------

  private setTimer(seconds: number) {
    Object.assign(this.state, { endsAt: Date.now() + seconds * 1000, remaining: null, paused: false })
    this.schedule()
  }

  private stopTimer() {
    clearTimeout(this.timer)
    Object.assign(this.state, { endsAt: null, remaining: null, paused: false })
  }

  private schedule() {
    clearTimeout(this.timer)
    const { endsAt } = this.state
    if (endsAt) this.timer = setTimeout(() => this.timeUp(), Math.max(0, endsAt - Date.now()))
  }

  private timeUp() {
    if (this.state.phase === 'answer') this.toVote()
    else if (this.state.phase === 'vote') this.closeVoting()
  }

  /** Nach einem Server-Neustart: Timer wieder aufziehen und offene KI-Antworten neu anfragen. */
  private resume() {
    this.schedule()
    if (this.state.phase === 'answer') this.askAis()
  }

  // ---------- Hilfen ----------

  private changed() { this.onChange() }
  private person(id: string) { return this.state.people.find(p => p.id === id) }
  /** Spieler und KIs, also alle, die Antworten schreiben. */
  private players() { return this.state.people.filter(p => p.role !== 'audience') }
  private questions() { return this.catalog[this.state.settings.language] }
  /** Anzahl gestarteter Runden = Index der nächsten Frage im Plan. */
  private played() { return this.state.round?.no ?? 0 }
  private visible() {
    return (this.state.round?.answers ?? []).filter(a => a.letter && !a.hidden).sort((a, b) => a.letter!.localeCompare(b.letter!))
  }
  private k() { return this.visible().filter(a => this.person(a.authorId)?.role === 'ai').length }

  private topics() { return [...new Set(this.questions().map(q => q.topic ?? ''))].filter(Boolean) }

  /** Zufällige freie Frage aus den gewählten Themen (keine gewählt = alle). */
  private freeQuestion() {
    const { topics } = this.state.settings
    const free = this.questions().filter(q => !this.state.plan.some(p => p.q === q.q) && (!topics.length || topics.includes(q.topic ?? '')))
    return free[Math.floor(Math.random() * free.length)] as Question | undefined
  }

  /** Ersetzt alle ungespielten Fragen durch count neue Zufallsfragen. */
  private drawPlan(count: number) {
    this.state.plan = this.state.plan.slice(0, this.played())
    for (let i = 0; i < count; i++) {
      const q = this.freeQuestion()
      if (q) this.state.plan.push(q)
    }
  }

  // ---------- Ansichten pro Rolle ----------

  view(viewer: Viewer) {
    const s = this.state, r = s.round
    const me = viewer.id ? this.person(viewer.id) : undefined
    const audience = s.people.filter(p => p.role === 'audience')
    const byPoints = <T extends { points: number }>(list: T[]) => [...list].sort((a, b) => b.points - a.points)
    const mine = me && r?.answers.find(x => x.authorId === me.id)
    const base = {
      phase: s.phase,
      paused: s.paused,
      endsIn: s.paused ? s.remaining : s.endsAt ? Math.max(0, s.endsAt - Date.now()) : null,
      duration: (s.phase === 'answer' ? s.settings.answerSeconds : s.settings.voteSeconds) * 1000,
      round: r?.no ?? 0,
      rounds: s.plan.length,
      language: s.settings.language,
      maxChars: s.settings.maxChars,
      maxPlayers: s.settings.maxPlayers,
      sound: s.settings.sound,
      beamerTheme: s.settings.beamerTheme,
      aiCount: s.phase === 'vote' ? this.k() : s.settings.ais.length,
      question: s.phase === 'lobby' ? null : r?.question.q ?? null,
      players: byPoints(this.players()).map(p => ({
        id: p.id, name: p.name, points: p.points, isAi: p.role === 'ai', avatar: p.avatar ?? null,
        done: !!r?.answers.some(a => a.authorId === p.id && a.final),
      })),
      audience: audience.length,
      detectives: byPoints(audience).filter(p => p.points > 0).slice(0, 3).map(p => ({ name: p.name, points: p.points, avatar: p.avatar ?? null })),
      // shortcut: zeigt höchstens 60 Köpfe im Publikum, der Rest erscheint als „+N“
      crowd: audience.slice(0, 60).map(p => ({ id: p.id, name: p.name, avatar: p.avatar ?? null })),
      // Vor der Auflösung nur Buchstabe und Text, niemals Absender
      answers: s.phase === 'vote' ? this.visible().map(a => ({ letter: a.letter!, text: a.text })) : null,
      votingOpen: !!r?.votingOpen,
      voters: r ? Object.keys(r.votes).length : 0,
      result: s.phase === 'reveal' ? r?.result ?? null : null,
      final: s.phase === 'final' ? this.finale() : null,
      finalStep: s.finalStep ?? 0,
      me: me ? {
        id: me.id, name: me.name, points: me.points, avatar: me.avatar ?? null,
        // Platz unter Gleichen: Spieler gegen Spieler und KIs, Publikum gegen Publikum
        rank: 1 + (me.role === 'audience' ? audience : this.players()).filter(p => p.points > me.points).length,
      } : null,
      mine: mine ? { text: mine.text, final: mine.final, letter: mine.letter } : null,
      myVote: me && r ? r.votes[me.id] ?? null : null,
      admin: null as null | ReturnType<Game['adminView']>,
    }
    if (viewer.role === 'admin') base.admin = this.adminView()
    return base
  }

  private adminView() {
    const s = this.state
    return {
      settings: s.settings,
      plan: s.plan.map(p => ({ q: p.q, custom: !p.ai.length })),
      catalog: this.questions().map(q => ({ q: q.q, topic: q.topic ?? '' })),
      topics: this.topics(),
      people: s.people.filter(p => p.role !== 'ai').map(p => ({ id: p.id, name: p.name, role: p.role, points: p.points, avatar: p.avatar ?? null, online: this.online.has(p.id) })),
      answers: (s.round?.answers ?? []).map(a => ({ ...a, name: this.person(a.authorId)?.name ?? '?', isAi: this.person(a.authorId)?.role === 'ai' })),
    }
  }

  private finale() {
    const all = this.state.history.flatMap(h => h.answers.map(a => ({ ...a, question: h.question })))
    const top = (list: typeof all, key: 'funVotes' | 'aiVotes') => list.filter(a => a[key] > 0).sort((a, b) => b[key] - a[key])
    return { funniest: top(all, 'funVotes').slice(0, 3), disguise: top(all.filter(a => !a.isAi), 'aiVotes')[0] ?? null }
  }
}

export type View = ReturnType<Game['view']>
