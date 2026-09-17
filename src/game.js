export const MIN_LENGTH = 3
export const MAX_LENGTH = 8
export const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// Hop (H) = digit is not in the secret at all
// Skip (S) = digit is in the secret, but not in this spot
// Jump (J) = digit is in this spot
export const HOP = 'H'
export const SKIP = 'S'
export const JUMP = 'J'

export function guessesAllowed(length) {
  return Math.max(6, length + 3)
}

export function isValidSecret(value, length) {
  return typeof value === 'string' && value.length === length && /^[0-9]+$/.test(value)
}

export function randomSecret(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // Rejection-free bias is irrelevant here, but keep it even anyway: 250 is the
  // largest multiple of 10 under 256, so resample anything above it.
  let out = ''
  for (let i = 0; i < length; i++) {
    let b = bytes[i]
    while (b >= 250) {
      const retry = new Uint8Array(1)
      crypto.getRandomValues(retry)
      b = retry[0]
    }
    out += String(b % 10)
  }
  return out
}

/**
 * Wordle's two-pass scoring. Exact matches are claimed first, then a
 * misplaced digit only earns a SKIP while unclaimed copies of it remain.
 * Secret 4417 / guess 4444 -> J J H H
 */
export function scoreGuess(guess, secret) {
  const n = secret.length
  const marks = new Array(n).fill(HOP)
  const remaining = new Map()

  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) {
      marks[i] = JUMP
    } else {
      remaining.set(secret[i], (remaining.get(secret[i]) ?? 0) + 1)
    }
  }

  for (let i = 0; i < n; i++) {
    if (marks[i] === JUMP) continue
    const d = guess[i]
    const left = remaining.get(d) ?? 0
    if (left > 0) {
      marks[i] = SKIP
      remaining.set(d, left - 1)
    }
  }

  return marks
}

const RANK = { [HOP]: 1, [SKIP]: 2, [JUMP]: 3 }

/**
 * Best-known status for each digit 0-9 across every guess so far.
 * A digit is only eliminated (HOP) if it has never scored S or J anywhere.
 */
export function digitStatuses(history) {
  const status = {}
  for (const { guess, marks } of history) {
    for (let i = 0; i < guess.length; i++) {
      const d = guess[i]
      const mark = marks[i]
      if (!status[d] || RANK[mark] > RANK[status[d]]) {
        status[d] = mark
      }
    }
  }
  return status
}

/** How many of each mark a guess earned. Reported per guess to analytics. */
export function markCounts(marks) {
  let jumps = 0
  let skips = 0
  let hops = 0
  for (const mark of marks) {
    if (mark === JUMP) jumps++
    else if (mark === SKIP) skips++
    else hops++
  }
  return { jumps, skips, hops }
}
