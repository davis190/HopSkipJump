import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DIGITS,
  HOP,
  JUMP,
  MAX_LENGTH,
  MIN_LENGTH,
  SKIP,
  digitStatuses,
  guessesAllowed,
  isValidSecret,
  markCounts,
  randomSecret,
  scoreGuess,
} from './game.js'
import { track } from './analytics.js'

const LENGTHS = Array.from({ length: MAX_LENGTH - MIN_LENGTH + 1 }, (_, i) => MIN_LENGTH + i)

// -webkit-text-security masks a plain text field. Where it is missing, fall back
// to type="password" so the number is never shown in the clear.
const canMaskWithCss =
  typeof CSS === 'undefined' ||
  typeof CSS.supports !== 'function' ||
  CSS.supports('-webkit-text-security', 'disc') ||
  CSS.supports('text-security', 'disc')

const MARK_CLASS = { [HOP]: 'hop', [SKIP]: 'skip', [JUMP]: 'jump' }
const MARK_WORD = { [HOP]: 'Hop', [SKIP]: 'Skip', [JUMP]: 'Jump' }

export default function App() {
  const [phase, setPhase] = useState('setup')
  const [length, setLength] = useState(4)
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [setupError, setSetupError] = useState('')
  const [history, setHistory] = useState([])
  const [current, setCurrent] = useState('')
  const [shake, setShake] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const secretFieldRef = useRef(null)

  const maxGuesses = guessesAllowed(length)
  const statuses = useMemo(() => digitStatuses(history), [history])
  const solved = history.length > 0 && history[history.length - 1].guess === secret
  const outOfGuesses = !solved && history.length >= maxGuesses
  const over = solved || outOfGuesses

  function startGame(value, source) {
    track('game_start', { digits: length, max_guesses: maxGuesses, secret_source: source })
    setSecret(value)
    setHistory([])
    setCurrent('')
    setRevealed(false)
    setSetupError('')
    setSecretInput('')
    setPhase('playing')
  }

  function handleSetSecret(event) {
    event.preventDefault()
    if (!isValidSecret(secretInput, length)) {
      setSetupError(`Enter exactly ${length} digits.`)
      secretFieldRef.current?.focus()
      return
    }
    startGame(secretInput, 'custom')
  }

  function handleRandom() {
    startGame(randomSecret(length), 'random')
  }

  function newNumber() {
    setPhase('setup')
    setSecret('')
    setSecretInput('')
    setSetupError('')
    setHistory([])
    setCurrent('')
    setRevealed(false)
  }

  const rejectGuess = useCallback(() => {
    setShake(true)
    window.setTimeout(() => setShake(false), 450)
  }, [])

  const submitGuess = useCallback(() => {
    if (current.length !== length) {
      rejectGuess()
      return
    }
    const marks = scoreGuess(current, secret)
    setHistory((prev) => [...prev, { guess: current, marks }])
    setCurrent('')

    // Reported from the handler rather than an effect on `history`: StrictMode
    // runs effects twice in development, which would double every event.
    const guessNumber = history.length + 1
    track('guess_submitted', { digits: length, guess_number: guessNumber, ...markCounts(marks) })
    if (current === secret) {
      track('game_won', { digits: length, guesses_used: guessNumber, max_guesses: maxGuesses })
    } else if (guessNumber >= maxGuesses) {
      track('game_lost', { digits: length, guesses_used: guessNumber, max_guesses: maxGuesses })
    }
  }, [current, history.length, length, maxGuesses, rejectGuess, secret])

  const pressDigit = useCallback(
    (digit) => {
      setCurrent((prev) => (prev.length >= length ? prev : prev + digit))
    },
    [length]
  )

  const pressBackspace = useCallback(() => {
    setCurrent((prev) => prev.slice(0, -1))
  }, [])

  useEffect(() => {
    if (phase !== 'playing' || over) return
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault()
        pressDigit(event.key)
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        pressBackspace()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        submitGuess()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [over, phase, pressBackspace, pressDigit, submitGuess])

  return (
    <div className={`app phase-${phase}`}>
      <header className="masthead">
        <h1>
          <span className="hop">Hop</span> <span className="skip">Skip</span>{' '}
          <span className="jump">Jump</span>
        </h1>
        <p className="tagline">Wordle, but for numbers</p>
      </header>

      {phase === 'setup' ? (
        <Setup
          length={length}
          setLength={(next) => {
            setLength(next)
            setSecretInput('')
            setSetupError('')
          }}
          secretInput={secretInput}
          setSecretInput={(value) => {
            setSecretInput(value.replace(/\D/g, '').slice(0, length))
            setSetupError('')
          }}
          error={setupError}
          onSubmit={handleSetSecret}
          onRandom={handleRandom}
          fieldRef={secretFieldRef}
        />
      ) : (
        <main className={over ? 'board-area over' : 'board-area'}>
          <Status
            solved={solved}
            outOfGuesses={outOfGuesses}
            guessesUsed={history.length}
            maxGuesses={maxGuesses}
            secret={secret}
          />

          <Board
            length={length}
            maxGuesses={maxGuesses}
            history={history}
            current={current}
            over={over}
            shake={shake}
          />

          <DigitBank statuses={statuses} />

          {over ? (
            <div className="endgame">
              {!solved && !revealed ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setRevealed(true)
                    track('number_revealed', { digits: length, guesses_used: history.length })
                  }}
                >
                  Reveal the number
                </button>
              ) : null}
              {!solved && revealed ? (
                <p className="reveal">
                  The number was <strong>{secret}</strong>
                </p>
              ) : null}
              <div className="endgame-actions">
                <button type="button" className="primary" onClick={newNumber}>
                  New number
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    track('game_quit', {
                      digits: length,
                      guesses_used: history.length,
                      result: solved ? 'won' : 'lost',
                    })
                    setPhase('quit')
                  }}
                >
                  Quit game
                </button>
              </div>
            </div>
          ) : (
            <Keypad
              onDigit={pressDigit}
              onBackspace={pressBackspace}
              onSubmit={submitGuess}
              statuses={statuses}
              ready={current.length === length}
            />
          )}
        </main>
      )}

      {phase === 'quit' ? (
        <main className="board-area">
          <div className="quit-card">
            <h2>Thanks for playing</h2>
            <button type="button" className="primary" onClick={newNumber}>
              Start a new game
            </button>
          </div>
        </main>
      ) : (
        <Legend />
      )}
    </div>
  )
}

function Setup({
  length,
  setLength,
  secretInput,
  setSecretInput,
  error,
  onSubmit,
  onRandom,
  fieldRef,
}) {
  const [reveal, setReveal] = useState(false)
  const masked = !reveal

  return (
    <main className="setup">
      <fieldset className="lengths">
        <legend>How many digits?</legend>
        <div className="length-row">
          {LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              className={n === length ? 'length on' : 'length'}
              aria-pressed={n === length}
              onClick={() => setLength(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <form onSubmit={onSubmit} className="secret-form">
        <div className="secret-label-row">
          <label htmlFor="secret-number">
            Set the number{' '}
            <span className="muted">({length} digits{reveal ? '' : ', hidden as you type'})</span>
          </label>
          <button
            type="button"
            className="reveal"
            aria-pressed={reveal}
            onClick={() => setReveal((on) => !on)}
          >
            {reveal ? 'Hide it' : 'Show me'}
          </button>
        </div>
        {/* A text field, not a password one: password managers offer to fill and save
            anything typed into a password field, which mangles the entry. Masking is
            CSS instead, so the number still stays off screen. */}
        <input
          id="secret-number"
          ref={fieldRef}
          type={masked && !canMaskWithCss ? 'password' : 'text'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          className={masked && canMaskWithCss ? 'secret-input masked' : 'secret-input'}
          placeholder={'•'.repeat(length)}
          value={secretInput}
          onChange={(event) =>
            setSecretInput(event.target.value.replace(/\D/g, '').slice(0, length))
          }
        />
        <p className="dots" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span key={i} className={i < secretInput.length ? 'dot filled' : 'dot'} />
          ))}
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={secretInput.length !== length}>
          Hide it &amp; start
        </button>
      </form>

      <div className="or">
        <span>or</span>
      </div>

      <button type="button" className="ghost wide" onClick={onRandom}>
        Generate a random {length}-digit number
      </button>
      <p className="muted center">Nobody sees it, not even the person who pressed the button.</p>
    </main>
  )
}

function Status({ solved, outOfGuesses, guessesUsed, maxGuesses, secret }) {
  if (solved) {
    return (
      <p className="status win">
        Got it in {guessesUsed} — <strong>{secret}</strong>
      </p>
    )
  }
  if (outOfGuesses) {
    return <p className="status lose">Out of guesses.</p>
  }
  return (
    <p className="status">
      Guess {guessesUsed + 1} of {maxGuesses}
    </p>
  )
}

function Board({ length, maxGuesses, history, current, over, shake }) {
  const rows = []
  for (let r = 0; r < maxGuesses; r++) {
    const past = history[r]
    const isActive = !over && r === history.length
    rows.push(
      <Row
        key={r}
        length={length}
        guess={past ? past.guess : isActive ? current : ''}
        marks={past ? past.marks : null}
        active={isActive}
        shake={isActive && shake}
      />
    )
  }
  return (
    <div className="board" style={{ '--rows': maxGuesses, '--cols': length }}>
      {rows}
    </div>
  )
}

function Row({ length, guess, marks, active, shake }) {
  const cells = []
  for (let i = 0; i < length; i++) {
    const digit = guess[i] ?? ''
    const mark = marks ? marks[i] : null
    const classes = ['cell']
    if (mark) classes.push(MARK_CLASS[mark])
    if (!mark && digit) classes.push('typed')
    if (active && i === guess.length) classes.push('caret')
    cells.push(
      <div
        key={i}
        className={classes.join(' ')}
        style={mark ? { animationDelay: `${i * 90}ms` } : undefined}
      >
        <span className="digit">{digit}</span>
        {mark ? <span className="mark">{mark}</span> : null}
      </div>
    )
  }
  const rowClasses = ['row', `len-${length}`]
  if (shake) rowClasses.push('shake')
  return (
    <div className={rowClasses.join(' ')} data-length={length}>
      {cells}
    </div>
  )
}

function DigitBank({ statuses }) {
  return (
    <section className="bank">
      <h2>Digits</h2>
      <div className="bank-row">
        {DIGITS.map((d) => {
          const mark = statuses[d]
          const classes = ['chip']
          if (mark) classes.push(MARK_CLASS[mark])
          if (mark === HOP) classes.push('out')
          return (
            <div key={d} className={classes.join(' ')} title={mark ? MARK_WORD[mark] : 'Untried'}>
              {d}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Keypad({ onDigit, onBackspace, onSubmit, statuses, ready }) {
  return (
    <section className="keypad">
      <div className="keypad-row">
        {DIGITS.map((d) => {
          const mark = statuses[d]
          const classes = ['key']
          if (mark) classes.push(MARK_CLASS[mark])
          return (
            <button key={d} type="button" className={classes.join(' ')} onClick={() => onDigit(d)}>
              {d}
            </button>
          )
        })}
      </div>
      <div className="keypad-row actions">
        <button type="button" className="key wide-key" onClick={onBackspace}>
          Delete
        </button>
        <button
          type="button"
          className={ready ? 'key wide-key go ready' : 'key wide-key go'}
          onClick={onSubmit}
        >
          Enter
        </button>
      </div>
    </section>
  )
}

function Legend() {
  return (
    <section className="legend">
      <div className="legend-item">
        <span className="swatch jump">J</span>
        <span>
          <strong>Jump</strong>
          <span className="legend-desc"> — right digit, right spot</span>
        </span>
      </div>
      <div className="legend-item">
        <span className="swatch skip">S</span>
        <span>
          <strong>Skip</strong>
          <span className="legend-desc"> — right digit, wrong spot</span>
        </span>
      </div>
      <div className="legend-item">
        <span className="swatch hop">H</span>
        <span>
          <strong>Hop</strong>
          <span className="legend-desc"> — digit isn't in the number</span>
        </span>
      </div>
    </section>
  )
}
