import type { FormEvent, ReactNode } from 'react'
import { useEffect, useId } from 'react'

interface SpaceModalProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  closeLabel: string
  inputLabel: string
  placeholder: string
  domainSuffix: string
  value: string
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  submitLabel: string
  pending?: boolean
  error?: string
  children?: ReactNode
}

export function SpaceModal(props: SpaceModalProps) {
  const { open, onClose } = props
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="lp-modal-root">
      <button type="button" className="lp-modal-scrim" aria-label={props.closeLabel} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="lp-modal">
        <h2 id={titleId}>{props.title}</h2>
        <p className="lp-modal-desc">{props.description}</p>
        <form className="lp-modal-form" onSubmit={props.onSubmit}>
          <label className="lp-field">
            <span className="lp-sr">{props.inputLabel}</span>
            <input
              value={props.value}
              onChange={e => props.onValueChange(e.target.value.toLowerCase())}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={props.placeholder}
            />
            <span className="lp-field-suffix">{props.domainSuffix}</span>
          </label>
          {props.error ? (
            <p className="lp-error" role="alert">
              {props.error}
            </p>
          ) : null}
          {props.children}
          <div className="lp-modal-actions">
            <button type="button" className="lp-cap lp-cap-glass" onClick={onClose}>
              {props.closeLabel}
            </button>
            <button type="submit" className="lp-cap" disabled={props.pending}>
              {props.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
