import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Game, sanitizeAvatar, score, type Ask, type Catalog, type Person, type State } from './game.ts'
import { clean, targetLength } from './ai.ts'
import realCatalog from './questions.json' with { type: 'json' }

const q = (n: number) => ({ q: `Frage ${n}?`, ai: [`KI-Antwort ${n} a`, `KI-Antwort ${n} b`, `KI-Antwort ${n} c`], topic: n % 2 ? 'christmas' : 'everyday' })
const catalog: Catalog = { de: Array.from({ length: 10 }, (_, i) => q(i)), en: [{ q: 'Question?', ai: ['AI answer'] }] }

// Antworten A (Mensch Jonas), B (Mensch Mia), C (KI Claude), D (Mensch Lena)
const answers = [
  { letter: 'A', authorId: 'jonas', isAi: false },
  { letter: 'B', authorId: 'mia', isAi: false },
  { letter: 'C', authorId: 'claude', isAi: true },
  { letter: 'D', authorId: 'lena', isAi: false },
]
const votes = (list: [string[], string | null][]) => Object.fromEntries(list.map(([ai, fun], i) => [`v${i}`, { ai, fun }]))

describe('score', () => {
  it('gibt +1 für die lustigste und +2 für den Menschen mit den meisten KI-Stimmen', () => {
    const r = score(answers, votes([[['A'], 'B'], [['A'], 'B'], [['C'], 'B'], [['A'], 'D']]), 1)
    expect(r.deltas.mia).toBe(1)
    expect(r.deltas.jonas).toBe(2)
    expect(r.deltas.claude).toBeUndefined()
    expect(r.deltas.v2).toBe(1) // einziger Detektiv, der die KI erkannt hat
    expect(r).toMatchObject({ voters: 4, caught: 1 })
  })

  it('verteilt bei Gleichstand an alle, auch Gleichstand mit der KI zählt als geschlagen', () => {
    const r = score(answers, votes([[['A'], 'B'], [['C'], 'D'], [['C'], 'B'], [['A'], 'D']]), 1)
    expect(r.deltas.mia).toBe(1)
    expect(r.deltas.lena).toBe(1)
    expect(r.deltas.jonas).toBe(2) // A und C je 2 KI-Stimmen
  })

  it('gibt kein +2, wenn die KI mehr KI-Stimmen hat, und der KI den Lustig-Punkt', () => {
    const r = score(answers, votes([[['C'], 'C'], [['C'], 'C'], [['A'], 'B']]), 1)
    expect(r.deltas.jonas).toBeUndefined()
    expect(r.deltas.claude).toBe(1)
  })

  it('wertet bei k = 2 die Top 2 und zählt pro erkannter KI einen Detektiv-Punkt', () => {
    const two = [...answers.slice(0, 3), { letter: 'D', authorId: 'gemini', isAi: true }]
    const r = score(two, votes([[['A', 'C'], null], [['C', 'D'], 'A'], [['A', 'B'], null]]), 2)
    // KI-Stimmen: A 2, C 2, D 1, B 1 → Top 2 = A und C, also bekommt Jonas +2 (und +1 lustig)
    expect(r.deltas.jonas).toBe(3)
    expect(r.deltas.mia).toBeUndefined()
    expect(r.deltas.v1).toBe(2)
    expect(r.caught).toBe(1)
  })

  it('ignoriert unbekannte Buchstaben, doppelte und überzählige KI-Stimmen', () => {
    const r = score(answers, votes([[['Z', 'A', 'A', 'B'], 'Q']]), 1)
    expect(r.rows.find(a => a.letter === 'A')!.aiVotes).toBe(1)
    expect(r.rows.find(a => a.letter === 'B')!.aiVotes).toBe(0)
    expect(r.rows.every(a => a.funVotes === 0)).toBe(true)
  })

  it('vergibt ohne Stimmen keine Punkte', () => {
    expect(score(answers, {}, 1).deltas).toEqual({})
  })
})

describe('Game', () => {
  let ask: ReturnType<typeof vi.fn<Ask>>
  let game: Game
  beforeEach(() => {
    vi.useFakeTimers()
    ask = vi.fn<Ask>().mockResolvedValue('Ich bin ganz sicher eine KI.')
    game = new Game(catalog, ask, () => {})
  })
  afterEach(() => vi.useRealTimers())

  const join = (role: 'player' | 'audience', name: string) => {
    const p = game.join(role, name) as Person
    game.connect(p.id)
    return p
  }
  const view = () => game.view({ role: 'admin' })

  it('prüft Namen und Spielerplätze, Publikum darf auch während des Spiels kommen', () => {
    expect(game.join('player', '  ')).toBe('error.nameEmpty')
    join('player', 'Mia')
    expect(game.join('audience', 'mia')).toBe('error.nameTaken')
    expect(game.join('player', 'Claude')).toBe('error.nameTaken')
    game.act('settings', { settings: { maxPlayers: 1 } })
    expect(game.join('player', 'Jonas')).toBe('error.playersFull')
    game.act('start')
    expect(game.join('player', 'Lena')).toBe('error.gameRunning')
    expect(typeof game.join('audience', 'Kati')).toBe('object')
  })

  it('spielt eine Runde: früheres Ende, Abstimmung, Auflösung, Punkte', async () => {
    const mia = join('player', 'Mia')
    const kati = join('audience', 'Kati')
    game.act('start')
    await vi.advanceTimersByTimeAsync(0) // KI antwortet
    expect(view().phase).toBe('answer')
    game.answer(mia.id, 'Ein strukturierter Start hilft.', true)
    expect(view().phase).toBe('vote') // alle fertig → sofort abstimmen
    const ai = view().admin!.answers.find(a => a.isAi)!
    const human = view().admin!.answers.find(a => !a.isAi)!
    expect(ai.source).toBe('live')
    game.vote(kati.id, [human.letter], human.letter)
    expect(view().votingOpen).toBe(false) // einziger Zuschauer hat abgestimmt
    game.act('reveal')
    const v = view()
    expect(v.phase).toBe('reveal')
    expect(v.players.find(p => p.name === 'Mia')!.points).toBe(3) // +1 lustig, +2 getarnt
    expect(v.detectives).toEqual([]) // Kati lag daneben
  })

  it('schickt bei Zeitablauf Entwürfe ab, verwirft leere und nimmt bei KI-Fehler die Ersatzantwort', async () => {
    ask.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mia = join('player', 'Mia')
    join('player', 'Jonas')
    game.act('start')
    game.answer(mia.id, 'Entwurf von Mia', false)
    await vi.advanceTimersByTimeAsync(60_000)
    const v = view()
    expect(v.phase).toBe('vote')
    expect(v.answers!.map(a => a.text).sort()).toEqual(['Entwurf von Mia', game.state.round!.question.ai[0]].sort())
    expect(v.admin!.answers.find(a => a.isAi)!.source).toBe('fallback')
  })

  it('lässt die KI bei eigener Frage ohne Ersatzantwort aussetzen', async () => {
    ask.mockResolvedValue('')
    const mia = join('player', 'Mia')
    game.act('plan.set', { index: 0, question: 'Eigene Frage?' })
    game.act('start')
    await vi.advanceTimersByTimeAsync(0)
    game.answer(mia.id, 'Meine Antwort', true)
    expect(view().answers).toHaveLength(1)
    expect(view().aiCount).toBe(0)
  })

  it('verwaltet den Fragenplan und sperrt gespielte Fragen', () => {
    expect(view().rounds).toBe(8)
    game.act('plan.add', { question: 'Neu?' })
    expect(view().admin!.plan.at(-1)).toEqual({ q: 'Neu?', custom: true })
    game.act('plan.remove', { index: 8 })
    const first = view().admin!.plan[0].q
    join('player', 'Mia')
    game.act('start')
    game.act('plan.remove', { index: 0 }) // läuft gerade → gesperrt
    expect(view().admin!.plan[0].q).toBe(first)
    expect(game.act('plan.add', { catalog: catalog.de.findIndex(c => c.q === first) })).toBe('error.questionUnavailable')
  })

  it('verschiebt Fragen nach oben und unten, aber nie vor gespielte', () => {
    const order = () => game.state.plan.map(p => p.q)
    const before = order()
    game.act('plan.move', { index: 3, to: 0 })
    expect(order().slice(0, 4)).toEqual([before[3], before[0], before[1], before[2]])
    game.act('plan.move', { index: 7, to: 8 }) // gibt es nicht
    expect(order()[7]).toBe(before[7])
    join('player', 'Mia')
    game.act('start') // Frage 1 läuft jetzt
    game.act('plan.move', { index: 2, to: 0 }) // darf nicht vor die gespielte
    expect(order()[0]).toBe(before[3])
    game.act('plan.move', { index: 0, to: 2 }) // gespielte bleibt stehen
    expect(order()[0]).toBe(before[3])
  })

  it('pausiert und verlängert den Timer', async () => {
    join('player', 'Mia')
    game.act('start')
    await vi.advanceTimersByTimeAsync(10_000)
    game.act('pause')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(view().phase).toBe('answer')
    expect(view().endsIn).toBe(50_000)
    game.act('extend')
    game.act('resume')
    await vi.advanceTimersByTimeAsync(64_000)
    expect(view().phase).toBe('answer')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(view().phase).toBe('vote')
  })

  it('entfernt gekickte Personen samt Antwort und Stimme', async () => {
    const mia = join('player', 'Mia')
    const jonas = join('player', 'Jonas')
    game.act('start')
    await vi.advanceTimersByTimeAsync(0)
    game.answer(mia.id, 'Hallo', true)
    game.act('kick', { id: jonas.id }) // Jonas fehlte noch → Runde geht weiter
    expect(view().phase).toBe('vote')
    expect(view().admin!.people.map(p => p.name)).toEqual(['Mia'])
  })

  it('zeigt Absender erst nach der Auflösung', async () => {
    const mia = join('player', 'Mia')
    game.act('start')
    await vi.advanceTimersByTimeAsync(0)
    game.answer(mia.id, 'Geheim', true)
    const beamer = JSON.stringify(game.view({ role: 'beamer' }))
    expect(beamer).not.toContain('authorId')
    expect(beamer).not.toContain('"admin":{')
  })

  it('stellt einen gespeicherten Spielstand samt Timer wieder her', async () => {
    join('player', 'Mia')
    game.act('start')
    const saved = JSON.parse(JSON.stringify(game.state)) as State
    const restored = new Game(catalog, ask, () => {}, saved)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(restored.view({}).phase).toBe('vote')
  })

  it('zieht Zufallsfragen nur aus den gewählten Themen', () => {
    game.act('settings', { settings: { topics: ['christmas', 'unbekannt'] } })
    expect(game.state.settings.topics).toEqual(['christmas'])
    game.act('plan.draw')
    expect(game.state.plan).toHaveLength(5) // nur 5 Weihnachtsfragen im Test-Katalog
    expect(game.state.plan.every(p => p.topic === 'christmas')).toBe(true)
  })

  it('führt durch das Finale: Podium, Detektive, beste Antworten', async () => {
    const mia = join('player', 'Mia')
    const kati = join('audience', 'Kati')
    const ben = join('audience', 'Ben')
    game.act('start')
    await vi.advanceTimersByTimeAsync(0)
    game.answer(mia.id, 'Menschlich!', true)
    const ai = view().admin!.answers.find(a => a.isAi)!.letter!
    const human = view().admin!.answers.find(a => !a.isAi)!.letter!
    game.vote(kati.id, [ai], human)
    game.vote(ben.id, [human], human)
    game.act('reveal')
    game.act('end')
    expect(view().finalStep).toBe(0)
    game.act('final.step', { step: 1 })
    expect(view().finalStep).toBe(1)
    game.act('final.step', { step: 9 })
    expect(view().finalStep).toBe(2)
    expect(view().final!.funniest.map(a => a.text)).toEqual(['Menschlich!'])
    expect(game.view({ role: 'audience', id: kati.id }).me!.rank).toBe(1) // hat die KI erkannt
    expect(game.view({ role: 'audience', id: ben.id }).me!.rank).toBe(2)
  })

  it('wechselt mit der Sprache den Fragenkatalog', () => {
    game.act('settings', { settings: { language: 'en' } })
    expect(view().admin!.plan.map(p => p.q)).toEqual(['Question?'])
  })
})

describe('Avatar', () => {
  it('begrenzt jede Angabe auf gültige Varianten', () => {
    expect(sanitizeAvatar({ shape: 4, color: 2.7, face: -1, hat: 99, glasses: 'x', extra: 1, unbekannt: 3 }))
      .toEqual({ shape: 4, color: 2, face: 0, hat: 0, glasses: 0, extra: 1 })
    expect(sanitizeAvatar(null)).toEqual({ shape: 0, color: 0, face: 0, hat: 0, glasses: 0, extra: 0 })
  })

  it('wird beim Beitreten gespeichert und in den Ansichten gezeigt', () => {
    const game = new Game(catalog, async () => '', () => {})
    const mia = game.join('player', 'Mia', { shape: 1, color: 3, face: 2, hat: 1, glasses: 4 }) as Person
    game.join('audience', 'Kati', { hat: 5 })
    const v = game.view({ role: 'player', id: mia.id })
    expect(v.me!.avatar).toEqual({ shape: 1, color: 3, face: 2, hat: 1, glasses: 4, extra: 0 })
    expect(v.players[0].avatar).toEqual(v.me!.avatar)
    expect(v.crowd.map(c => c.avatar!.hat)).toEqual([5])
  })

  it('lässt sich bis zum Spielstart ändern, danach nicht mehr', () => {
    const game = new Game(catalog, async () => '', () => {})
    const mia = game.join('player', 'Mia', { hat: 1 }) as Person
    game.setAvatar(mia.id, { hat: 11, extra: 2 })
    expect(mia.avatar).toMatchObject({ hat: 11, extra: 2 })
    game.act('start')
    game.setAvatar(mia.id, { hat: 3 })
    expect(mia.avatar!.hat).toBe(11)
  })
})

describe('questions.json', () => {
  it('hat in beiden Sprachen gleich viele Fragen mit je 3 Ersatzantworten bis 200 Zeichen', () => {
    const { de, en } = realCatalog as Catalog
    expect(de.length).toBe(en.length)
    for (const list of [de, en]) {
      expect(new Set(list.map(x => x.q)).size).toBe(list.length)
      for (const x of list) expect(x.ai.length === 3 && x.ai.every(a => a.length > 0 && a.length <= 200)).toBe(true)
    }
    expect(de.find(x => x.q.includes('Zufallszahl'))!.ai).toEqual(['17', '17', '17'])
    expect(de.filter(x => x.topic === 'christmas').length).toBe(20)
  })
})

describe('clean', () => {
  it('entfernt Markdown, Umbrüche und Anführungszeichen', () => {
    expect(clean('„**Kaffee** und\n\nSchlaf.“', 200)).toBe('Kaffee und Schlaf.')
  })

  it('entfernt Emojis und Smileys, lässt aber Uhrzeiten und Abkürzungen stehen', () => {
    expect(clean('Kaffee! ☕😄 Und dann ab ins Bett 🛌🏽 :) xD', 200)).toBe('Kaffee! Und dann ab ins Bett')
    expect(clean('Um 10:30 z.B. Pause ;-)', 200)).toBe('Um 10:30 z.B. Pause')
    expect(clean('Weihnachten 🎄🇩🇪 — schön', 200)).toBe('Weihnachten - schön')
  })

  it('kürzt zu lange Antworten am Satzende oder am ganzen Wort, nie mitten im Wort', () => {
    expect(clean('Erst Kaffee trinken. Dann den Tag ganz entspannt angehen und lächeln.', 40)).toBe('Erst Kaffee trinken.')
    expect(clean('Kaffee trinken und den Tag entspannt angehen', 20)).toBe('Kaffee trinken und')
  })

  it('peilt gut die Hälfte des Zeichenlimits an', () => {
    expect(targetLength(200)).toBe(110)
    expect(targetLength(50)).toBe(50)
  })
})
