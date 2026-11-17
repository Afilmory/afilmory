import { useCallback, useState } from 'react'

import type { Translations } from '../i18n'
import { checkTenantSlug } from './api'

type CreateCopy = Translations['createModal']

export function validateSlug(
  raw: string,
  copy: Pick<CreateCopy, 'validations'>,
): { slug: string, error: string | null } {
  const slug = raw.trim().toLowerCase()
  if (!slug) {
    return { slug, error: copy.validations.required }
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { slug, error: copy.validations.invalid }
  }
  if (slug.length < 3) {
    return { slug, error: copy.validations.minLength }
  }
  return { slug, error: null }
}

export function useCreateSpace(copy: CreateCopy) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = useCallback(
    async (raw: string) => {
      const { slug, error: invalid } = validateSlug(raw, copy)
      if (invalid) {
        setError(invalid)
        return
      }
      setError('')
      setPending(true)
      try {
        const payload = await checkTenantSlug(slug)
        if (!payload.ok) {
          setError(payload.message ?? copy.errors.generic)
          return
        }
        const nextUrl = payload.next_url ?? payload.nextUrl ?? payload.redirect_url ?? payload.redirectUrl ?? null
        if (!nextUrl) {
          setError(copy.errors.missingRedirect)
          return
        }
        window.location.href = nextUrl
      }
      catch {
        setError(copy.errors.network)
      }
      finally {
        setPending(false)
      }
    },
    [copy],
  )

  const reset = useCallback(() => {
    setError('')
    setPending(false)
  }, [])

  return { submit, pending, error, reset }
}
