import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import { tenantLoginUrl } from '../lib/api'
import { validateSlug } from '../lib/create-space'
import { SpaceModal } from './SpaceModal'

export interface LoginSpaceModalProps {
  open: boolean
  onClose: () => void
  locale: Locale
}

export function LoginSpaceModal({ open, onClose, locale }: LoginSpaceModalProps) {
  const copy = translate(locale).loginModal
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setError('')
    }
  }, [open])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const { slug, error: invalid } = validateSlug(name, copy)
    if (invalid) {
      setError(invalid)
      return
    }
    window.location.href = tenantLoginUrl(slug)
  }

  return (
    <SpaceModal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      closeLabel={copy.close}
      inputLabel={copy.inputLabel}
      placeholder={copy.placeholder}
      domainSuffix={copy.domainSuffix}
      value={name}
      onValueChange={setName}
      onSubmit={onSubmit}
      submitLabel={copy.button}
      error={error}
    />
  )
}
