import type { FormEvent } from 'react'
import { useEffect, useId, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import { tenantLoginUrl } from '../lib/api'

export interface LoginSpaceModalProps {
  open: boolean
  onClose: () => void
  locale: Locale
}

export function LoginSpaceModal({ open, onClose, locale }: LoginSpaceModalProps) {
  const copy = translate(locale).loginModal
  const titleId = useId()
  const [spaceName, setSpaceName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setSpaceName('')
    setError('')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const slug = spaceName.trim().toLowerCase()

    if (!slug) {
      setError(copy.validations.required)
      return
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError(copy.validations.invalid)
      return
    }
    if (slug.length < 3) {
      setError(copy.validations.minLength)
      return
    }

    window.location.href = tenantLoginUrl(slug)
  }

  return (
    <div className="modal-root fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label={copy.close}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg border border-line bg-card p-8 shadow-2xl"
      >
        <p className="font-mono text-xs tracking-widest uppercase text-accent">{copy.label}</p>
        <h2 id={titleId} className="mt-3 font-serif text-3xl text-fg">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{copy.description}</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-xs tracking-wide text-dim">{copy.inputLabel}</span>
            <div className="mt-2 flex items-center border border-line bg-page focus-within:border-accent">
              <input
                value={spaceName}
                onChange={e => setSpaceName(e.target.value.toLowerCase())}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={copy.placeholder}
                className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none"
              />
              <span className="shrink-0 pr-3 font-mono text-xs text-dim">{copy.domainSuffix}</span>
            </div>
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex flex-wrap gap-3 pt-1">
            <button type="submit" className="btn">
              {copy.button}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {copy.close}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
