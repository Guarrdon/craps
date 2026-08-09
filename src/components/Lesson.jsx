/*
 * One bet, pointed at.
 *
 * Training mode: instead of putting a chip down, a click opens this over the
 * spot. Everything in it comes from school.js, and the numbers there are
 * derived from the catalogue rather than written out again - so a lesson
 * cannot describe a bet the felt no longer makes.
 *
 * It is placed beside the spot it is about rather than in the middle of the
 * screen, because the point is to connect a piece of printed cloth to what it
 * means, and a modal in the centre breaks that connection every time.
 */

import { useEffect, useRef } from 'react'
import { FELT } from '../lib/layout.js'
import { explain } from '../lib/school.js'

export default function Lesson({ id, table, point, at, onClose }) {
  const box = useRef(null)
  useEffect(() => {
    box.current?.focus()
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, id])

  if (!id) return null
  const lesson = explain(id, table, { point })
  const [x, y] = at

  // Nudged to whichever side of the spot has room, so it never hangs off the
  // table. The felt is a fixed aspect ratio, so these percentages land in the
  // same place at every size.
  const left = (x / FELT.w) * 100
  const top = (y / FELT.h) * 100
  const flipX = left > 52
  const flipY = top > 46

  return (
    <div className="lesson-layer" onClick={onClose} role="presentation">
      <div
        className={`lesson${flipX ? ' flip-x' : ''}${flipY ? ' flip-y' : ''}`}
        style={{ left: `${left}%`, top: `${top}%` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={lesson.title}
        tabIndex={-1}
        ref={box}
      >
        <header>
          <h3>{lesson.title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <p className="lesson-what">{lesson.what}</p>

        <dl className="lesson-figures">
          <div>
            <dt>Comes in</dt>
            <dd>{lesson.chance}</dd>
          </div>
          <div>
            <dt>Worth</dt>
            <dd>{lesson.trueOdds}</dd>
          </div>
          <div>
            <dt>Pays</dt>
            <dd>{lesson.pays}</dd>
          </div>
          <div>
            <dt>Costs</dt>
            <dd className={lesson.free ? 'is-free' : 'is-cost'}>{lesson.cost}</dd>
          </div>
        </dl>
        {lesson.gap && <p className="lesson-gap">{lesson.gap}</p>}

        <h4>Playing it</h4>
        <ul className="lesson-play">
          {lesson.play.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        {lesson.say && (
          <>
            <h4>What you say</h4>
            <p className="lesson-say">{lesson.say}</p>
          </>
        )}
        {lesson.called && (
          <>
            <h4>What you&rsquo;ll hear</h4>
            <p className="lesson-called">{lesson.called}</p>
          </>
        )}
      </div>
    </div>
  )
}
