import Anthropic from '@anthropic-ai/sdk'
import type { Judge, Provider, Settings } from './game.ts'

// Kurz und ohne Emojis: Lange Antworten am Zeichenlimit und Smileys verraten die KI sofort.
const PROMPTS: Record<Settings['language'], Record<Settings['aiStyle'], (target: number) => string>> = {
  de: {
    natural: n =>
      `Du spielst bei einem Partyspiel mit. Beantworte die Frage auf Deutsch in deinem ganz normalen Stil als hilfsbereiter KI-Assistent, aber kurz: ein Satz, höchstens zwei, unter ${n} Zeichen. Keine Emojis, keine Smileys, kein Markdown, keine Aufzählung, keine Anführungszeichen, keine Rückfragen.`,
    disguised: n =>
      `Du spielst bei einem Partyspiel mit. Die Menschen versuchen, wie eine KI zu klingen. Du musst klingen wie ein Mensch, der schnell am Handy tippt: locker, knapp, gern umgangssprachlich oder mit einem kleinen Tippfehler. Antworte auf Deutsch in einem kurzen Satz unter ${n} Zeichen. Keine Emojis, keine Smileys, kein Markdown, keine Erklärung, kein Hinweis darauf, dass du eine KI bist.`,
  },
  en: {
    natural: n =>
      `You are taking part in a party game. Answer the question in English in your completely normal style as a helpful AI assistant, but briefly: one sentence, two at most, under ${n} characters. No emojis, no smileys, no markdown, no lists, no quotation marks, no follow-up questions.`,
    disguised: n =>
      `You are taking part in a party game. The humans try to sound like an AI. You must sound like a human typing quickly on a phone: casual, short, maybe slangy or with a small typo. Answer in English in one short sentence under ${n} characters. No emojis, no smileys, no markdown, no explanation, no hint that you are an AI.`,
  },
}

/** Ziellänge für die KI: gut die Hälfte des Limits, so lang wie typische Handy-Antworten. */
export const targetLength = (max: number) => Math.round(Math.min(max, Math.max(50, max * 0.55)))

export const KEYS: Record<Provider, string> = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3\u{E0020}-\u{E007F}]/gu
// ASCII-Smileys wie :) ;-) :D xD <3, nur als eigenes Wort (lässt 10:30 oder z.B. in Ruhe)
const EMOTICON = /(^|\s)(?:[:;=8][-'^o]?[)(\]\[DPpOo3/\\|*]+|<3|\^\^|[xX]D)(?=$|\s|[.,!?])/g

/** Macht aus der Modellantwort eine Spielantwort: ohne Emojis, Smileys und Markdown, höchstens max Zeichen. */
export function clean(text: string, max: number) {
  const s = text.replace(EMOJI, '').replace(EMOTICON, '$1').replace(/[*_#`>]/g, '').replace(/\s*—\s*/g, ' - ')
    .replace(/\s+/g, ' ').trim().replace(/^["„“]+|["“”]+$/g, '').trim()
  if (s.length <= max) return s
  // Zu lang: am letzten Satzende kürzen, sonst am letzten ganzen Wort. Abgehackte Wörter verraten die KI.
  const cut = s.slice(0, max + 1)
  const sentence = [...cut.matchAll(/[.!?](?=\s|$)/g)].pop()
  if (sentence?.index !== undefined && sentence.index > max * 0.4 && sentence.index < max) return cut.slice(0, sentence.index + 1)
  const space = cut.lastIndexOf(' ', max)
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, max)).replace(/[\s,;:–-]+$/, '')
}

export async function askAi(provider: Provider, question: string, settings: Settings) {
  const key = process.env[KEYS[provider]]
  if (!key) throw new Error(`${KEYS[provider]} fehlt, nutze Ersatzantwort`)
  const system = PROMPTS[settings.language][settings.aiStyle](targetLength(settings.maxChars))
  const signal = AbortSignal.timeout(settings.answerSeconds * 1000)
  const text = await ASK[provider](key, system, question, signal)
  return clean(text, settings.maxChars)
}

// Die KI im Publikum erfährt nur, was auch auf den Handys steht: Frage, Antworten mit Buchstaben, Anzahl der KIs.
const JURY_PROMPTS: Record<Settings['language'], (k: number) => string> = {
  de: k =>
    `Du sitzt im Publikum eines Partyspiels. Menschen beantworten eine Frage und versuchen dabei, wie eine KI zu klingen. ${k === 0 ? 'Diesmal stammt keine Antwort von einer KI.' : k === 1 ? 'Genau eine Antwort stammt von einer echten KI.' : `Genau ${k} Antworten stammen von echten KIs.`} Du stimmst ab: Welche Antworten sind von einer KI, und welche Antwort findest du am lustigsten? Antworte nur mit JSON in genau dieser Form, ohne weiteren Text: {"ai":["A"],"fun":"B"}. "ai" enthält genau ${k} Buchstaben, "fun" genau einen.`,
  en: k =>
    `You are in the audience of a party game. Humans answer a question and try to sound like an AI. ${k === 0 ? 'This time no answer comes from an AI.' : k === 1 ? 'Exactly one answer comes from a real AI.' : `Exactly ${k} answers come from real AIs.`} You vote: which answers are from an AI, and which answer do you find the funniest? Reply only with JSON in exactly this form, no other text: {"ai":["A"],"fun":"B"}. "ai" holds exactly ${k} letters, "fun" exactly one.`,
}

/** Liest die Stimme aus der Modellantwort. Ob die Buchstaben gültig sind, prüft das Spiel wie bei jedem Handy. */
export function parseVote(text: string): { ai: unknown; fun: unknown } {
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) throw new Error('keine Stimme in der Antwort')
  const { ai, fun } = JSON.parse(json)
  if (!Array.isArray(ai) && typeof fun !== 'string') throw new Error('keine Stimme in der Antwort')
  return { ai, fun }
}

export const askJury: Judge = async (provider, question, answers, k, settings) => {
  const key = process.env[KEYS[provider]]
  if (!key) throw new Error(`${KEYS[provider]} fehlt`)
  const list = answers.map(a => `${a.letter}: ${a.text}`).join('\n')
  const signal = AbortSignal.timeout(settings.voteSeconds * 1000)
  return parseVote(await ASK[provider](key, JURY_PROMPTS[settings.language](k), `${question}\n\n${list}`, signal))
}

let claude: Anthropic | undefined

const ASK: Record<Provider, (key: string, system: string, question: string, signal: AbortSignal) => Promise<string>> = {
  async claude(key, system, question, signal) {
    claude ??= new Anthropic({ apiKey: key })
    // Haiku 5.5: schnell und günstig. Denkt immer adaptiv mit, effort 'low' hält das kurz.
    // Kein serverseitiger Fallback bei Haiku: Lehnt es ab, nimmt das Spiel die Ersatzantwort aus dem Katalog.
    const res = await claude.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 16000, // Denken zählt mit, deshalb großzügig
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: question }],
    }, { signal })
    if (res.stop_reason === 'refusal') throw new Error('Claude hat abgelehnt')
    return res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  },

  async openai(key, system, question, signal) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
        max_completion_tokens: 4000, // Reasoning-Modelle zählen Denk-Tokens mit
        messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  },

  async gemini(key, system, question, signal) {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts ?? []
    return parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
  },
}
