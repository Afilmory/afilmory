import type { FormEvent } from 'react'
import { useState } from 'react'

import type { Translations } from '../i18n'
import { useCreateSpace } from '../lib/create-space'

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
      <div className="lp-in lp-open-row">
        <h2>
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </h2>
        <div className="lp-open-form">
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
