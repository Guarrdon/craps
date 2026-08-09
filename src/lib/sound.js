/*
 * The table, heard.
 *
 * Synthesised rather than sampled. A craps table makes three sounds worth
 * having - dice on cloth, chips being paid, and the noise a table makes when
 * something good happens - and all three are short, percussive and noisy,
 * which is exactly what an oscillator and a filter are good at. Recording them
 * would mean either a network request, which this game does not make, or a few
 * hundred kilobytes of base64 in a build that is currently ninety.
 *
 * It also means every throw sounds slightly different, because the parameters
 * are jittered rather than replayed.
 *
 * Nothing here runs until the player has clicked something. Browsers will not
 * start an AudioContext before a gesture, and asking before then produces a
 * console warning and a suspended context that never recovers.
 */

let ctx = null
let master = null
let noiseBuffer = null

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  // Safari and Chrome both suspend until a gesture; a click on Roll is one.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// One second of white noise, made once. Everything percussive is a window cut
// out of this and shaped by a filter and an envelope.
function noise() {
  const c = audio()
  if (!c) return null
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/*
 * A burst of filtered noise: the building block for anything that clatters.
 *
 * `tone` is where the bandpass sits, `q` how tight, `length` how long it rings
 * and `level` how loud. A die on cloth is a wide, low, short one; a chip is a
 * narrow, high, shorter one.
 */
function burst({ at = 0, tone = 1200, q = 1, length = 0.06, level = 0.3, type = 'bandpass' }) {
  const c = audio()
  const buf = noise()
  if (!c || !buf) return
  const t = c.currentTime + at

  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 0.7 + Math.random() * 0.6
  // Start somewhere random in the second of noise, so no two bursts are the
  // same slice of the same waveform.
  const offset = Math.random() * 0.8

  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.value = tone
  filter.Q.value = q

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)

  src.connect(filter).connect(gain).connect(master)
  src.start(t, offset, length + 0.05)
  src.stop(t + length + 0.05)
}

// A struck note, for anything that is meant to sound like good news.
function tone({ at = 0, hz = 440, length = 0.5, level = 0.16, shape = 'triangle' }) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + at

  const osc = c.createOscillator()
  osc.type = shape
  osc.frequency.value = hz

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)

  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + length + 0.05)
}

// ------------------------------------------------------------------ the cues

/*
 * Dice on cloth.
 *
 * Two dice leaving a hand, hitting the back wall and rattling to a stop: a
 * scatter of short wooden knocks over about a second, thinning out as they
 * settle, with a couple of louder ones early where they hit the wall.
 */
export function dice() {
  if (muted) return
  const knocks = 7 + Math.floor(Math.random() * 4)
  for (let i = 0; i < knocks; i++) {
    // Bunched at the start and spreading out, the way a real throw does.
    const at = 0.02 + (i / knocks) ** 1.6 * 0.95 + Math.random() * 0.04
    const fade = 1 - i / (knocks + 2)
    burst({
      at,
      tone: 900 + Math.random() * 1500,
      q: 1.6,
      length: 0.035 + Math.random() * 0.03,
      level: (0.1 + Math.random() * 0.16) * fade,
    })
  }
  // The low thump of them landing, under all of it.
  burst({ at: 0.06, tone: 150, q: 0.7, length: 0.12, level: 0.16, type: 'lowpass' })
}

/*
 * Chips, paid.
 *
 * A stack set down on cloth: a click and a short clatter of chips settling
 * against each other. Louder and longer for more of them, but only a little -
 * a big win should be recognisable, not deafening.
 */
export function paid(size = 1) {
  if (muted) return
  const chips = Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, size))))
  for (let i = 0; i < chips; i++) {
    burst({
      at: i * 0.028 + Math.random() * 0.012,
      tone: 2600 + Math.random() * 1800,
      q: 3.5,
      length: 0.035,
      level: 0.1 + Math.random() * 0.05,
    })
  }
  burst({ at: 0, tone: 420, q: 1.2, length: 0.06, level: 0.09, type: 'lowpass' })
}

/*
 * Something worth hearing about.
 *
 * A rising figure rather than a fanfare - this fires on a hop or a hardway, not
 * on a jackpot, and it has to be bearable the fortieth time.
 */
export function bigWin() {
  if (muted) return
  const root = 392 // G
  const steps = [1, 5 / 4, 3 / 2, 2]
  steps.forEach((ratio, i) => {
    tone({ at: i * 0.075, hz: root * ratio, length: 0.7 - i * 0.06, level: 0.13 })
    tone({ at: i * 0.075, hz: root * ratio * 2, length: 0.4, level: 0.05, shape: 'sine' })
  })
  paid(6)
}

// ------------------------------------------------------------------- muting

let muted = false
export const setMuted = (v) => {
  muted = !!v
}
export const isMuted = () => muted

// Something has to touch the context inside a click handler or the browser
// never lets it start. Called when the player first does anything.
export const wake = () => audio()

// ---------------------------------------------------------------- what to play

/*
 * Which sounds a roll's outcome calls for.
 *
 * Pure, so the decision can be tested without a browser and without anything
 * being audible. The interface plays whatever comes back.
 *
 * `big` is anything paying three to one or better - a hardway, a hop, a prop,
 * the bonus row. It deliberately excludes the odds on a four, which pay 2:1,
 * and the field's double, because a table does not react to those either.
 */
export function cuesFor(events) {
  const paidOut = events.filter((e) => e.kind === 'pay')
  if (!paidOut.length) return { paid: 0, big: false }
  const total = paidOut.reduce((sum, e) => sum + e.pay, 0)
  const big = paidOut.some((e) => e.amount > 0 && e.pay / e.amount >= 3)
  return { paid: total, big }
}

// Play the outcome of a roll. Called once the crew has finished working it.
export function payout(events) {
  const { paid: total, big } = cuesFor(events)
  if (!total) return
  if (big) bigWin()
  else paid(total / 25)
}
