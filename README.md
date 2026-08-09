# Craps

A Vegas craps table in your browser. Every bet that is printed on the felt is
playable, the table refuses what a dealer would refuse, and the dice are
physically thrown — the result drawn from your browser's cryptographic random
source before they leave the shooter's hand.

![The table mid-hand: chips on the box, odds behind the line, dice in the air](docs/table.png)

## Play it

```bash
npm install
npm run dev
```

To make a copy you can host anywhere, or keep in a folder and open with no
network at all:

```bash
npm run build
```

## The table

The layout is a specific one — a burgundy felt with the box numbers gold and
the come box red, drawn from photographs of the real thing. Box numbers are
4, 5, Six, 8, Nine and 10 only; this is not a crapless table. There is no Big 6
or Big 8, because that table does not have one.

What is on it:

| | |
| --- | --- |
| **The line** | Pass, Don't Pass (bar 12), Come, Don't Come, and odds behind any of them |
| **The box** | Place, Buy and Lay on all six numbers |
| **The field** | 2 · 3 · 4 · 9 · 10 · 11 · 12, with 2 and 12 both paying double |
| **The centre** | Any Seven, Any Craps, Aces, Ace Deuce, Yo, Boxcars, the Horn, C & E |
| **Hardways** | 4 and 10 at 7:1, 6 and 8 at 9:1 |
| **Hops** | All seventeen circles — four doubles at 30:1, thirteen easy ways at 15:1 |
| **The bonus row** | Little Ones, Big Ones and Boom or Bust, on a shared tracker |

### The colours mean something

On a real felt they do not — they are the layout's branding. On the table this
one is drawn from they are worse than meaningless: the come box is printed red
like the one-roll props even though it rides as long as the line does, and the
field is gold like the box numbers even though it is over on the very next
throw. Those two are exactly the ones people get wrong.

So here **gold rides** and **red is one throw**. Cream is not a bet at all —
the payouts, the printed dice, the markers. Which makes the exceptions visible
instead of hidden: the hardways sit in the middle of the prop box and are gold,
because they ride; the field sits out with the line and is red, because it does
not.

This is the only place the game deliberately departs from the photograph.

## The rules it actually keeps

Most of the work is in the things a table says no to.

- **Increments.** Place 6 and 8 want multiples of $6 so 7:6 pays in whole
  dollars; 5 and 9 want fives; odds behind a 5 must be even. A bet that cannot
  be paid correctly is refused at the point of placing, and the table says what
  to make it — "the six pays in $6 steps, make it $30" — which is what a dealer
  says while sliding the chips back.
- **Odds caps.** 3-4-5x by default: three times on the 4 and 10, four on the 5
  and 9, five on the 6 and 8, so every point wins exactly six times the flat
  bet and the dealer never has to think about it. The don't side is quoted the
  same way — lay whatever it takes to win six times your bet. Other schemes,
  from 1x to 100x, are in the table settings.
- **Working and off.** Place bets, buys, hardways and come odds are off on a
  come-out unless you call them on. Which is what makes a come-out seven
  survivable: your come bet on the six loses, but its odds were never at risk
  and come back.
- **Contract bets.** The pass line and a come bet on a number cannot be taken
  down once they have a number. A line bet *can* be picked up before the
  come-out throw, because until there is a point it is only chips on the felt.
- **Vigorish.** 5% on a buy, charged on the stake; 5% on a lay, charged on the
  win. A dollar minimum either way, rounded down, which is most of why a small
  buy is a bad bet.
- **The line rides.** When the point is made the dealer pays your pass line by
  setting an equal stack beside it. You pick up the payout; the original is
  still there as your bet for the next come-out. Almost nobody picks it up.
- **Press and regress.** A winning place bet is paid alongside and stays where
  it is. Press puts up as much of the win as the spot can be paid on and hands
  back the rest — the six pays $35, press it to $60, five back. Every bet
  remembers what you last deliberately set it to, so "back to thirty" still
  means thirty three presses later.

### The bonus row

Little Ones, Big Ones and Boom or Bust share one set of markers rather than
having three of their own, which is how the tables that run it do it. When
Little fills it pays and comes down, but the markers stay lit — Big and Boom
are still running on the same numbers. Which also means Little cannot go up
again in that hand: every number it wants is already marked, so it would be a
certainty rather than a bet. A seven wipes the board and the next shooter can
win it again.

The price is the one thing on this felt that genuinely differs house to house,
so it is a setting: 30 to 1, 31 to 1, or 34 to 1. A house printing **31 for 1**
is printing 30 to 1 — "for one" includes your stake coming back and "to one"
does not — which is why the same bet reads as 31 at one table and 30 at
another. The rate itself does differ, and it matters: at 30 to 1 these are the
most expensive bets on the layout at 18.30%, and at 34 to 1 they are among the
better long shots at 7.76%.

## The dice

A rigid-body simulation of two dice is not provably fair — whatever bias is in
how the throw is generated ends up in the result, and however small that is, a
casino game cannot have it. But a result drawn in advance and played back as a
canned animation is not a throw either. It is the same twelve seconds every
time and you can feel it.

You can have both, and the way through is the cube itself.

A cube is unchanged by any of the twenty four rotations that map it onto
itself. Its collision geometry, its inertia — everything the physics touches —
is identical; the only thing those rotations move is the pips. So:

1. Draw the result from `crypto.getRandomValues`. A real one in thirty six.
2. Throw the dice and simulate. See what they happen to land on.
3. Rotate each die's *starting* orientation by the symmetry that carries the
   face it landed on round to the face that was drawn.
4. Play it back. Same throw, different pips.

In exact arithmetic one pass would always be enough. In floating point it is
not quite: the twisted die's corners come out of the rotation in a different
order, differing in the last decimal place, and a bouncing cube amplifies that.
So it throws, looks, twists and throws again — about 1.98 passes on average.

The guarantee does not rest on the arithmetic being perfect. It rests on the
result being read from the throw that gets played back, never asserted over it:
**what you watch land is what you get paid for, always.** The test suite says
so ten thousand throws at a time.

The dice are six divs a cube turned by the quaternion the physics produced — no
WebGL, no library. Two dice is not enough geometry to be worth a renderer.

## Training mode

**Explain the felt**, in the header, turns clicks into questions. Point at any
spot and it tells you about that one bet: what it is, how often it actually
comes in, what it is worth against what it pays, when it may be made and when
it is at risk, what you say to put it up, and what the stickman calls when it
hits.

The numbers are derived from the same code that settles the bets — the chance
comes from settling all thirty six throws against the bet itself — so a lesson
cannot describe a bet the felt no longer makes. Only the English is
hand-written, and the English is the part that is hard to find anywhere else,
because it is what nobody at a busy table will stop to tell you: that odds on
the line you place yourself but odds on a come bet go to the dealer, that you
never say "eleven" because it sounds like seven, that Any Seven comes back as
"big red" once a point is out.

It is also where the one genuinely counter-intuitive thing about a pay table
becomes obvious. Any Seven pays 4:1 and Any Craps pays 7:1, and Any Craps is
the cheaper bet — 11.1% against 16.7%. Both are short exactly one unit of true
odds; the house keeps the same single unit either way. What differs is what
that unit is a share of. One in six is 16.7%; one in nine is 11.1%. The bigger
payout spreads the same shortfall over more money.

## Your data

Everything stays in your browser. There is no server, no account, and the game
makes no network request of its own — you can disconnect and it plays exactly
the same. Your rail, your bets and your figures are in localStorage; clearing
your browser data removes them.

Games in progress are saved as you play, so you can close the tab and pick up
mid-hand.

## Sound

Three cues, synthesised rather than sampled: dice on cloth, a cash register on
anything paying 3:1 or better, and the sound of a table being cleared on a
seven out. All three are short, percussive and noisy, which is what an
oscillator and a filter are good at — and recording them would mean either a
network request, which this game does not make, or a few hundred kilobytes of
base64 in a build that is ninety. Every throw is slightly different, because
the parameters are jittered rather than replayed.

There is a switch in the header, and it is remembered.

## Building on it

Plain JavaScript and React, built with Vite. No runtime dependencies beyond
React itself.

```
src/
  lib/
    bets.js      every bet, what it pays, when it works, what may come down
    rules.js     resolve(roll, table) -> the whole table's outcome. Pure.
    table.js     the state machine, and every way a player can change the felt
    limits.js    minimums, increments, odds caps, vig, and what is refused
    dice.js      the deterministic rigid-body throw, and the symmetry trick
    rng.js       crypto-backed, seedable for tests and the simulator
    layout.js    the felt as coordinates — every region and where its chips go
    school.js    one bet explained, with the numbers derived from the catalogue
    edges.js     what each bet costs, shared by the rules screen and the audit
    sound.js     three cues, synthesised
    bank.js      chips and denominations
    calls.js     what the stickman says
    storage.js   the saved game, the figures, the preferences
  components/    Felt, Chips, Dice, Rail, Crew, Lesson, Dialogs
public/          manifest and icons, copied to the build as-is
test/            the engine, the felt, the dice, the lessons, the sound cues
```

The rules live apart from the interface, so they can be tested directly:

```bash
npm test
```

Over thirteen hundred assertions across the payout tables, every rule above,
dice determinism and distribution, and long sessions replayed from a fixed
seed. The one worth knowing about is money conservation: across thirty thousand
randomised rolls, what the player holds — the rail plus everything still on the
felt — moves by exactly the winnings less the losses and by nothing else. That
is the check that catches a double payment, a bet paid but not taken down, or a
stake returned twice.

### The browser harnesses

Some things cannot be checked by reading the source, so they are measured in a
real browser.

```bash
npm run probe     # click all 50 printed spots, check the right bet answers
npm run play      # play a hand end to end and fail on anything the page says
npm run fits      # four viewports: nothing off-screen, nothing under 44px
npm run offline   # build it and play with every request refused
npm run shot      # photograph the table
```

`probe` earned its place immediately: it found that *none* of the spots were
clickable, because a box on a craps layout is an outline with felt inside it
and only the 2px printed border was answering. `fits` found the table running
off the side of a phone — twice, and for the same reason both times, a CSS grid
sizing its implicit tracks to their contents.

### Measuring the house

```bash
npm run sim                          # every bet, against what it should cost
npm run sim -- --strategy pass-odds  # play a strategy and report the damage
```

`sim.mjs` drives the engine headless — no React, no felt, no dice — which is
the whole reason `src/lib` has no interface code in it. It measures each bet
against the figures in `edges.js`, which are the same figures the rules screen
shows the player, so a payout that is a shade too generous moves the
measurement away from what the game claims and shows up as a flagged row.

Flat pass line with 3-4-5x odds comes out at 0.371% of action against a
published 0.374%.

### The artwork

```bash
npm run icons
```

The app icons and the portal's cover are drawn as SVG in `scripts/icons.mjs`
and rendered through the browser that is already a dependency, rather than
checked in as binaries nobody can edit.

## The portal

Served from `lhstart.com/games/craps/`, alongside sudoku and snowline. The
build is relative (`base: './'`), it writes `dist/offline.json` so the portal's
service worker knows what to keep, and it includes the two shared scripts — the
exit chip and the offline registration — from the portal's own origin. Those
are absolute paths, so they simply do not load on a dev server, which is
intentional: no exit chip when there is nothing to exit to.

```bash
npm run deploy
```

Builds, refuses to upload a build with root-absolute asset paths, uploads to
this game's own bucket, and invalidates just that prefix. Needs an
authenticated session (`aws login`). The offline contract is written up in the
[lhstart README](https://github.com/Guarrdon/lhstart).

## Licence

MIT — see [LICENSE](LICENSE).
