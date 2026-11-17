import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, extname, resolve, sep } from 'node:path'
import { Server } from 'socket.io'
import { Game, type Catalog, type Defaults, type State } from './game.ts'
import { askAi, KEYS } from './ai.ts'
import catalog from './questions.json' with { type: 'json' }

if (existsSync('.env')) process.loadEnvFile() // vorhandene Umgebungsvariablen haben Vorrang
const PORT = Number(process.env.PORT || 3000)
const DATA_FILE = process.env.DATA_FILE ?? 'data/game.json' // leer = nichts speichern (Tests)
const QUESTIONS_FILE = process.env.QUESTIONS_FILE ?? 'data/questions.json' // eigene Fragen, gleiches Format wie server/questions.json
const DEFAULTS_FILE = process.env.DEFAULTS_FILE ?? 'server/defaults.json' // Startbestand, solange noch nichts gespeichert ist (leer = keiner)
const PASSWORD = process.env.ADMIN_PASSWORD
const DEV = process.argv.includes('--dev')
if (!DEV && !existsSync('dist/index.html')) {
  console.error('dist/ fehlt. Erst `npm run build` ausführen (oder `npm run dev` zum Entwickeln).')
  process.exit(1)
}
if (!PASSWORD) {
  console.error('ADMIN_PASSWORD fehlt. Lege eine .env an (Vorlage: .env.example).')
  process.exit(1)
}

// ---------- Netzwerk-Adresse für die QR-Codes ----------
const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i!.address)
// shortcut: nimmt die erste private 192.168.x-Adresse, bei VPN/mehreren Netzen notfalls PUBLIC_URL setzen
const lanIp = ips.find(ip => ip.startsWith('192.168.')) ?? ips[0] ?? 'localhost'
const joinUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') || `http://${lanIp}:${PORT}`

// ---------- Spielstand und eigene Fragen laden und sichern ----------
const load = <T,>(file: string) => {
  if (!file || !existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    // Kopie behalten: Ein Tippfehler in einer von Hand bearbeiteten Datei darf sie beim nächsten Sichern nicht kosten
    copyFileSync(file, `${file}.kaputt`)
    console.warn(`${file} unlesbar, starte ohne (Kopie liegt in ${file}.kaputt):`, err)
    return undefined
  }
}
const write = (file: string, json: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, json)
  renameSync(`${file}.tmp`, file) // atomar: keine halbe Datei bei Absturz
}
let savedOwn = ''
const save = () => {
  if (DATA_FILE) write(DATA_FILE, JSON.stringify(game.state))
  const own = JSON.stringify(game.own, null, 1)
  if (QUESTIONS_FILE && own !== savedOwn) write(QUESTIONS_FILE, savedOwn = own) // nur wenn sich die Sammlung geändert hat
}

// ---------- HTTP: Vite im Dev-Modus, sonst dist/ ----------
const server = createServer()
const DIST = resolve('dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
}
function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let file = resolve(DIST, `.${path}`)
  // Unbekannte Pfade und Ausbruchsversuche (../) bekommen die App, React wählt die Seite
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) file = resolve(DIST, 'index.html')
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(readFileSync(file))
}
if (DEV) {
  const { createServer: createVite } = await import('vite')
  // native: Node lädt vite.config.ts direkt. Sonst legt Vite eine Temp-Kopie an und löscht sie wieder, was node --watch als Änderung sieht und endlos neu startet
  const vite = await createVite({ configLoader: 'native', server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  server.on('request', vite.middlewares)
} else server.on('request', serveStatic)

// ---------- Socket.IO (nach dem Request-Handler anhängen, damit /socket.io zuerst greift) ----------
const io = new Server(server, { destroyUpgrade: false })
// Gespeichertes hat Vorrang: Der Startbestand gilt nur für ein frisches Spiel bzw. solange es keine eigene Fragen-Datei gibt
const defaults = load<Defaults>(DEFAULTS_FILE)
const game = new Game(catalog as Catalog, askAi, changed, load<State>(DATA_FILE), load<Catalog>(QUESTIONS_FILE), defaults)
savedOwn = JSON.stringify(game.own, null, 1)
const keys = Object.fromEntries(Object.entries(KEYS).map(([p, env]) => [p, !!process.env[env]]))

function changed() {
  for (const s of io.sockets.sockets.values()) if (s.data.role) s.emit('state', viewFor(s.data))
  save()
}
const viewFor = (data: { role?: string; id?: string }) => ({ ...game.view(data as never), joinUrl, keys: data.role === 'admin' ? keys : null })
// shortcut: Sperre im Speicher pro Adresse; hinter Proxy/Tunnel zählt die erste X-Forwarded-For-Adresse
const failures = new Map<string, { count: number; until: number }>()
const clientIp = (s: { handshake: { headers: Record<string, unknown>; address: string } }) =>
  String(s.handshake.headers['x-forwarded-for'] ?? s.handshake.address).split(',')[0].trim()
const hash = (s: unknown) => createHash('sha256').update(String(s)).digest()
const isPassword = (s: unknown) => timingSafeEqual(hash(s), hash(PASSWORD))
type Ack = (r: { ok?: true; token?: string; error?: string }) => void

io.on('connection', socket => {
  const send = () => socket.emit('state', viewFor(socket.data))
  const ack = (fn: unknown): Ack => (typeof fn === 'function' ? fn as Ack : () => {})

  socket.on('hello', (msg, cb) => {
    const reply = ack(cb), { role, token, password } = msg ?? {}
    if (role === 'beamer') socket.data = { role }
    else if (role === 'admin') {
      const ip = clientIp(socket), failed = failures.get(ip)
      if (failed && failed.until > Date.now()) return reply({ error: 'error.tooManyAttempts' })
      if (!isPassword(password)) {
        const count = (failed?.count ?? 0) + 1
        failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 })
        return setTimeout(() => reply({ error: 'error.wrongPassword' }), 400) // bremst Durchprobieren
      }
      failures.delete(ip)
      socket.data = { role }
    } else {
      const p = game.byToken(token)
      if (!p || p.role !== role) return reply({ error: 'error.unknownToken' })
      socket.data = { role, id: p.id }
      game.connect(p.id)
    }
    send()
    reply({ ok: true })
  })

  socket.on('join', (msg, cb) => {
    const reply = ack(cb), role = msg?.role
    if (role !== 'player' && role !== 'audience') return reply({ error: 'error.unknownAction' })
    const p = game.join(role, msg?.name, msg?.avatar)
    if (typeof p === 'string') return reply({ error: p })
    socket.data = { role, id: p.id }
    game.connect(p.id)
    reply({ ok: true, token: p.token })
  })

  socket.on('answer', msg => {
    if (socket.data.role === 'player') game.answer(socket.data.id, msg?.text, msg?.final === true)
  })

  socket.on('avatar', msg => {
    if (socket.data.id) game.setAvatar(socket.data.id, msg)
  })

  socket.on('vote', msg => {
    if (socket.data.role === 'audience') game.vote(socket.data.id, msg?.ai, msg?.fun)
  })

  socket.on('admin', (msg, cb) => {
    const reply = ack(cb)
    if (socket.data.role !== 'admin') return reply({ error: 'error.wrongPassword' })
    const { type, ...args } = msg ?? {}
    const error = game.act(String(type), args)
    if (error) return reply({ error })
    if (type === 'kick') for (const s of io.sockets.sockets.values()) if (s.data.id === args.id) {
      s.data = {}
      s.emit('kicked')
    }
    reply({ ok: true })
  })

  socket.on('disconnect', () => {
    if (socket.data.id) game.disconnect(socket.data.id)
  })
})

server.listen(PORT, () => {
  console.log(`\nReverse Turing Test läuft${DEV ? ' (Dev)' : ''}:`)
  console.log(`  Beamer:  http://localhost:${PORT}/beamer`)
  console.log(`  Admin:   http://localhost:${PORT}/admin`)
  console.log(`  Handys:  ${joinUrl}   (weitere Adressen: ${ips.join(', ') || '–'})`)
  for (const [p, ok] of Object.entries(keys)) if (!ok) console.log(`  Hinweis: kein Key für ${p}, diese KI nutzt Ersatzantworten.`)
})
