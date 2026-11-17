import type { CSSProperties } from 'react'

import type { Translations } from '../i18n'
import { ApertureArt, DoorsArt, FalloffArt } from './PrincipleArt'
import { SplitText } from './SplitText'

const ARTS = [ApertureArt, FalloffArt, DoorsArt] as const

export function Story({
  statement,
  principles,
}: {
  statement: Translations['statement']
  principles: Translations['principles']
}) {
  const total = Array.from(statement.lead).length + Array.from(statement.rest).length
  return (
    <>
      <section className="lp-statement">
        <div className="lp-in">
          <p
            className="lp-scrub-text"
            data-scroll
            data-scroll-start="0.9"
            data-scroll-end="0.35"
            style={{ '--n': total } as CSSProperties}
          >
            <SplitText text={statement.lead} />
            <span className="lp-dim">
              <SplitText text={statement.rest} offset={Array.from(statement.lead).length} />
            </span>
          </p>
        </div>
      </section>
      <section className="lp-principles">
        <div className="lp-in lp-principles-grid">
          {principles.map((item, index) => {
            const Art = ARTS[index]
            return (
              <div
                key={item.title}
                className="lp-principle"
                data-reveal
                style={{ '--d': `${index * 120}ms` } as CSSProperties}
              >
                <Art />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
