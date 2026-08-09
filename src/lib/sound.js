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

/*
 * Noise swept through a moving filter: anything that slides.
 *
 * A cash drawer coming out, chips raked off the felt. Both are broadband and
 * both move - down for a drawer, down and away for a rake - which a bandpass
 * with a ramping frequency does convincingly and a static one does not at all.
 */
function slide({ at = 0, from = 2000, to = 500, length = 0.25, level = 0.08, q = 1.2 }) {
  const c = audio()
  const buf = noise()
  if (!c || !buf) return
  const t = c.currentTime + at

  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true

  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + length)

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)

  src.connect(filter).connect(gain).connect(master)
  src.start(t, Math.random() * 0.4)
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

/*
 * A struck bell.
 *
 * The partials of a bell are not whole multiples of its fundamental, which is
 * the whole reason a bell sounds like metal and a sine sounds like a test
 * tone. These ratios are roughly a small bell's, and the higher ones die away
 * faster, which is what gives the strike its bright front and warm tail.
 */
function bell({ at = 0, hz = 1100, length = 1, level = 0.12 }) {
  const partials = [
    [1, 1, 1],
    [2.0, 0.55, 0.7],
    [2.97, 0.38, 0.5],
    [4.12, 0.22, 0.34],
    [5.43, 0.13, 0.24],
  ]
  for (const [ratio, amp, decay] of partials) {
    tone({ at, hz: hz * ratio, length: length * decay, level: level * amp, shape: 'sine' })
  }
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
export function paid(size = 1, at = 0) {
  if (muted) return
  const chips = Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, size))))
  for (let i = 0; i < chips; i++) {
    burst({
      at: at + i * 0.028 + Math.random() * 0.012,
      tone: 2600 + Math.random() * 1800,
      q: 3.5,
      length: 0.035,
      level: 0.1 + Math.random() * 0.05,
    })
  }
  burst({ at, tone: 420, q: 1.2, length: 0.06, level: 0.09, type: 'lowpass' })
}

/*
 * A cash register.
 *
 * Four things in about half a second, and all four have to be there or it is
 * just a bell: the key going down, the bell struck twice a hair apart, the
 * drawer sliding out, and the drawer stopping. Miss the last one and it sounds
 * like a doorbell; miss the first and it sounds like a clock.
 *
 * It fires on a hop or a hardway rather than a jackpot, so it has to be
 * bearable the fortieth time - which is why the bell is small and bright
 * rather than large and long.
 */
export function register(at = 0) {
  if (muted) return
  // The key, and the mechanism under it.
  burst({ at, tone: 1000, q: 2.2, length: 0.028, level: 0.15 })
  burst({ at: at + 0.014, tone: 260, q: 0.9, length: 0.055, level: 0.13, type: 'lowpass' })

  // Struck twice, milliseconds apart, which is what a real till does and what
  // stops it sounding like a single synthesised ping.
  bell({ at: at + 0.036, hz: 1180, length: 1.05, level: 0.13 })
  bell({ at: at + 0.058, hz: 1572, length: 0.62, level: 0.06 })

  // The drawer out, and the drawer stopping.
  slide({ at: at + 0.16, from: 2200, to: 520, length: 0.24, level: 0.085 })
  burst({ at: at + 0.42, tone: 170, q: 0.8, length: 0.14, level: 0.13, type: 'lowpass' })
  burst({ at: at + 0.42, tone: 900, q: 1.4, length: 0.04, level: 0.06 })
}

/*
 * Seven out.
 *
 * The sound of a table being cleared: chips raked off the felt, and a couple of
 * flat notes going down rather than up. Short, because it happens rather a lot
 * and nobody wants to be mourned at for two seconds every time.
 */
export function sevenOut() {
  if (muted) return
  // The rake, across and away.
  slide({ at: 0, from: 3400, to: 620, length: 0.36, level: 0.1, q: 0.9 })
  tone({ at: 0.02, hz: 196, length: 0.46, level: 0.1 }) // G3
  tone({ at: 0.15, hz: 155.6, length: 0.66, level: 0.095 }) // E flat 3
  burst({ at: 0.3, tone: 128, q: 0.7, length: 0.2, level: 0.11, type: 'lowpass' })
}

/*
 * Craps on the come-out.
 *
 * The same shape, much smaller. A two, three or twelve takes the line and
 * nothing else, and the table barely reacts - so neither does this.
 */
export function crapsOut() {
  if (muted) return
  burst({ at: 0, tone: 420, q: 1, length: 0.05, level: 0.07, type: 'lowpass' })
  tone({ at: 0, hz: 233, length: 0.26, level: 0.08 })
  tone({ at: 0.085, hz: 185, length: 0.34, level: 0.07 })
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
  return {
    paid: paidOut.reduce((sum, e) => sum + e.pay, 0),
    big: paidOut.some((e) => e.amount > 0 && e.pay / e.amount >= 3),
    // The hand ending, which is not the same as losing money - a don't bettor
    // gets paid on the same throw.
    sevenOut: events.some((e) => e.kind === 'sevenout'),
    // A two, three or twelve on the come-out. Takes the line and nothing else.
    craps: events.some((e) => e.kind === 'craps'),
  }
}

/*
 * Play the outcome of a roll, once the crew has finished working it.
 *
 * Order matters, because both can happen on one throw: a seven out clears the
 * table and pays the don't side on the way past. The rake first, then the
 * money, which is the order a table does it in.
 */
export function outcome(events) {
  const cues = cuesFor(events)
  if (cues.sevenOut) sevenOut()
  else if (cues.craps) crapsOut()

  if (!cues.paid) return
  const after = cues.sevenOut ? 0.44 : cues.craps ? 0.2 : 0
  if (cues.big) register(after)
  else paid(cues.paid / 25, after)
}
