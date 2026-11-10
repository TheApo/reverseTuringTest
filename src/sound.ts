// Dezente Töne per Web Audio, ohne Audiodateien. Browser erlauben Ton erst nach einem Klick.
let ctx: AudioContext | undefined

export function unlockSound() {
  ctx ??= new AudioContext()
  return ctx.resume()
}
export const soundReady = () => ctx?.state === 'running'

export const SOUNDS = {
  timeUp: [784, 523],
  reveal: [523, 659, 784],
  final: [523, 659, 784, 1047, 1319],
}

export function play(notes: number[], step = 0.13) {
  if (!ctx || ctx.state !== 'running') return
  notes.forEach((freq, i) => {
    const t = ctx!.currentTime + i * step
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 2.5)
    osc.connect(gain).connect(ctx!.destination)
    osc.start(t)
    osc.stop(t + step * 2.6)
  })
}
