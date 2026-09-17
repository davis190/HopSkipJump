import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scoreGuess,
  digitStatuses,
  guessesAllowed,
  isValidSecret,
  markCounts,
} from './game.js'

test('all correct', () => {
  assert.deepEqual(scoreGuess('417', '417'), ['J', 'J', 'J'])
})

test('nothing in common', () => {
  assert.deepEqual(scoreGuess('235', '417'), ['H', 'H', 'H'])
})

test('right digits, wrong spots', () => {
  assert.deepEqual(scoreGuess('741', '417'), ['S', 'S', 'S'])
})

test('duplicate guess digits do not over-claim', () => {
  assert.deepEqual(scoreGuess('4444', '4417'), ['J', 'J', 'H', 'H'])
})

test('duplicate in secret, single in guess', () => {
  assert.deepEqual(scoreGuess('1004', '0041'), ['S', 'J', 'S', 'S'])
})

test('a repeated guess digit only skips as many times as the secret holds it', () => {
  // secret 417 holds one 7, so the first 7 skips and the second hops
  assert.deepEqual(scoreGuess('774', '417'), ['S', 'H', 'S'])
})

test('an exact match claims the copy a misplaced digit would have used', () => {
  // the 7 at index 1 is exact, leaving nothing for the 7 at index 0
  assert.deepEqual(scoreGuess('770', '171'), ['H', 'J', 'H'])
})

test('leading zeros are preserved', () => {
  assert.deepEqual(scoreGuess('007', '070'), ['J', 'S', 'S'])
})

test('digit statuses keep the best result per digit', () => {
  const history = [
    { guess: '123', marks: ['H', 'S', 'H'] },
    { guess: '213', marks: ['S', 'J', 'H'] },
  ]
  assert.deepEqual(digitStatuses(history), { 1: 'J', 2: 'S', 3: 'H' })
})

test('guess allowance scales with length but never below six', () => {
  assert.equal(guessesAllowed(3), 6)
  assert.equal(guessesAllowed(4), 7)
  assert.equal(guessesAllowed(8), 11)
})

test('secret validation', () => {
  assert.equal(isValidSecret('007', 3), true)
  assert.equal(isValidSecret('00', 3), false)
  assert.equal(isValidSecret('1a3', 3), false)
  assert.equal(isValidSecret('1 3', 3), false)
})

test('mark counts tally a guess', () => {
  assert.deepEqual(markCounts(scoreGuess('4444', '4417')), { jumps: 2, skips: 0, hops: 2 })
  assert.deepEqual(markCounts(scoreGuess('741', '417')), { jumps: 0, skips: 3, hops: 0 })
  assert.deepEqual(markCounts([]), { jumps: 0, skips: 0, hops: 0 })
})
