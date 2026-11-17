import type { Translations } from '../i18n'
import { ApertureArt, DoorsArt, FalloffArt } from './PrincipleArt'

const ARTS = [ApertureArt, FalloffArt, DoorsArt] as const

export function Story({
  statement,
  principles,
}: {
  statement: Translations['statement']
  principles: Translations['principles']
}) {
  return (
    <>
      <section className="lp-statement">
        <div className="lp-in">
          <p>
            {statement.lead}
            <span>{statement.rest}</span>
          </p>
        </div>
      </section>
      <section className="lp-principles">
        {principles.map((item, index) => {
          const Art = ARTS[index]
          return (
            <div key={item.title}>
              <Art />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          )
        })}
      </section>
    </>
  )
}
