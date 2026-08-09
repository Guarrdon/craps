import { check, done, eq, near } from './harness.js'
import { BET_IDS, betDef } from '../src/lib/bets.js'
import { BONUS_PAYTABLES, EDGES } from '../src/lib/edges.js'
import { DEFAULT_TABLE } from '../src/lib/limits.js'
import { explain, spoken, trueOdds, waysOf } from '../src/lib/school.js'

const table = DEFAULT_TABLE
const all = BET_IDS.map((id) => explain(id, table))

// ------------------------------------------------------------ completeness

for (const id of BET_IDS) {
  const e = explain(id, table)
  check(`${e.title} is explained`, !!e.what, id)
  check(`${e.title} says how to make it`, !!e.say, id)
  check(`${e.title} says what you will hear`, !!e.called, id)
  check(`${e.title} says how it plays`, e.play.length >= 3, id)
  check(`${e.title} quotes a payout`, !!e.pays, id)
  check(`${e.title} quotes what it is worth`, !!e.trueOdds, id)
}

/*
 * ---------------------------------------------------------- and specifically
 *
 * The bug this file exists for. The lesson text used to fall back to the bet's
 * *group*, so all eight centre bets shared one line - it offered you "dollar
 * yo" while you were looking at Any Seven - and every place bet said "thirty
 * on the six" whichever number you had pointed at.
 *
 * A family whose members differ only by a number must read differently for
 * each number, in both directions: what you say, and what you hear.
 */
const FAMILIES = {
  'the centre': ['any7', 'anycraps', 'aces', 'acedeuce', 'yo', 'boxcars', 'horn', 'ce'],
  'the place bets': [4, 5, 6, 8, 9, 10].map((n) => `place-${n}`),
  'the buys': [4, 5, 6, 8, 9, 10].map((n) => `buy-${n}`),
  'the lays': [4, 5, 6, 8, 9, 10].map((n) => `lay-${n}`),
  'the hardways': [4, 6, 8, 10].map((n) => `hard-${n}`),
  'the come numbers': [4, 5, 6, 8, 9, 10].map((n) => `come-odds-${n}`),
  'the bonus row': ['little', 'big', 'all'],
}

for (const [name, ids] of Object.entries(FAMILIES)) {
  for (const field of ['say', 'called']) {
    const said = ids.map((id) => explain(id, table)[field])
    eq(`no two of ${name} share the same "${field}"`, new Set(said).size, ids.length)
  }
}

{
  // Every hop is the same bet with different pips, so the phrase has to carry
  // the pips - "dollar hop three-three" is a different bet from "five-four".
  const hops = BET_IDS.filter((id) => betDef(id).group === 'hop')
  eq('all seventeen hops are called out differently', new Set(hops.map((id) => explain(id, table).say)).size, hops.length)
}

// A couple of them read out in full, because a table that is merely all
// different could still be all wrong.
check('the six asks for thirty', /Thirty on the six/.test(explain('place-6', table).say), explain('place-6', table).say)
check('the four asks for twenty-five', /Twenty-five on the four/.test(explain('place-4', table).say))
check('the hard ten is a hard ten', /hard ten/.test(explain('hard-10', table).say))
check('the yo warns you off saying eleven', /Never .eleven/.test(explain('yo', table).say))
check('any seven knows it is called big red', /big red/.test(explain('any7', table).say))
check('a hop names its own pips', /five-four/.test(explain('hop-4-5', table).say), explain('hop-4-5', table).say)
check('come odds go to the dealer, not down yourself', /dealer/.test(explain('come-odds-9', table).say))
check('pass odds you place yourself', /yourself/.test(explain('pass-odds', table).say))

// ----------------------------------------------------------------- numbers

eq('a seven comes six ways', waysOf('any7').win, 6)
eq('craps comes four ways', waysOf('anycraps').win, 4)
eq('a hard eight comes one way and loses ten', waysOf('hard-8').lose, 10)
eq('the seven is worth 5:1', trueOdds('any7'), '5:1')
eq('any craps is worth 8:1', trueOdds('anycraps'), '8:1')
eq('the six against the seven is 6:5', trueOdds('place-6'), '6:5')

// The comparison the whole mode exists to make: the bigger payout is the
// cheaper bet, because both are short exactly one unit of true odds.
{
  const seven = explain('any7', table)
  const craps = explain('anycraps', table)
  check('any craps pays more than any seven', craps.pays === '7:1' && seven.pays === '4:1')
  check('and costs less', EDGES.anycraps < EDGES.any7)
}

check('odds are shown as costing nothing', explain('pass-odds', table).free)
check('and say so in words', /keeps nothing/.test(explain('pass-odds', table).gap ?? ''))

// ------------------------------------------------------------ the pay table

for (const key of Object.keys(BONUS_PAYTABLES)) {
  const at = { ...table, bonus: key }
  const rate = BONUS_PAYTABLES[key].pays.little
  eq(`Little Ones pays ${rate}:1 at the ${key} table`, explain('little', at).pays, `${rate}:1`)
}
check(
  'and it costs less the more it pays',
  Number(explain('little', { ...table, bonus: '34' }).cost.replace('%', '')) <
    Number(explain('little', { ...table, bonus: '30' }).cost.replace('%', '')),
)
check(
  'with 31 to 1 sitting between the two',
  (() => {
    const at = (b) => Number(explain('little', { ...table, bonus: b }).cost.replace('%', ''))
    return at('34') < at('31') && at('31') < at('30')
  })(),
)

// -------------------------------------------------------------- said aloud

eq('a dollar is a dollar', spoken(1), 'a dollar')
eq('five is five', spoken(5), 'five')
eq('twenty-five', spoken(25), 'twenty-five')
eq('thirty', spoken(30), 'thirty')
eq('forty-four', spoken(44), 'forty-four')
eq('a hundred and twenty', spoken(120), 'one hundred and twenty')

// ---------------------------------------------------------------- the play

{
  const p = explain('place-6', table).play.join(' ')
  check('a place bet says it is off on the come-out', /come-out/.test(p), p)
  check('and that it can be taken down', /taken down/.test(p))
  check('and what it wants', /\$6 steps/.test(p))

  const line = explain('pass', table).play.join(' ')
  check('the line says it is a contract', /contract/.test(line), line)
  check('and that it is made on a come-out', /come-out/.test(line))

  const buy = explain('buy-4', table).play.join(' ')
  check('a buy mentions its commission', /5%/.test(buy), buy)
}

done('school')
