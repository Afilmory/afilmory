import type { FormEvent } from 'react'
import { useState } from 'react'

import type { Translations } from '../i18n'
import { useCreateSpace } from '../lib/create-space'
import { Mark } from './Mark'

interface OpenSectionProps {
  copy: Translations['open']
  createCopy: Translations['createModal']
}

export function OpenSection({ copy, createCopy }: OpenSectionProps) {
  const [name, setName] = useState('')
  const { submit, pending, error } = useCreateSpace(createCopy)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit(name)
  }

  return (
    <section className="lp-open" id="open">
      <div className="lp-floor lp-floor-top" />
      <div className="lp-in lp-open-row" data-reveal>
        <div>
          <Mark className="lp-mark-open" />
          <h2>
            <span className="lp-line">{copy.title[0]}</span>
            <span className="lp-line">{copy.title[1]}</span>
          </h2>
        </div>
        <div className="lp-open-form lp-rise" style={{ '--d': '240ms' } as React.CSSProperties}>
          <form className="lp-claim" onSubmit={onSubmit}>
            <label>
              <input
                value={name}
                onChange={e => setName(e.target.value.toLowerCase())}
                aria-label={createCopy.inputLabel}
                placeholder={createCopy.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
              <span>{createCopy.domainSuffix}</span>
            </label>
            <button className="lp-cap" type="submit" disabled={pending}>
              {pending ? copy.pending : copy.button}
            </button>
          </form>
          {error ? (
            <p className="lp-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="lp-fine">{copy.fine}</p>
          )}
        </div>
      </div>
    </section>
  )
}
