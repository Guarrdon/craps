/*
 * The whole test framework. Node runs these files directly; there is nothing
 * to install and nothing to configure, which is the point.
 */

let failures = 0
let count = 0

export const check = (name, ok, extra = '') => {
  count++
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

export const eq = (name, actual, expected) =>
  check(name, Object.is(actual, expected), Object.is(actual, expected) ? '' : `got ${actual}, wanted ${expected}`)

// Money comparisons, to the cent. Everything in the engine should land on
// whole dollars, but a rounding bug shows up as a fraction and this is where
// it gets caught rather than swallowed.
export const near = (name, actual, expected, tolerance = 1e-9) =>
  check(
    name,
    Math.abs(actual - expected) <= tolerance,
    Math.abs(actual - expected) <= tolerance ? '' : `got ${actual}, wanted ${expected}`,
  )

export const done = (title) => {
  console.log(`\n${title}: ${count - failures}/${count} passed`)
  if (failures) process.exit(1)
}
