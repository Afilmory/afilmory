import { cx } from '@afilmory/utils'
import { memo, useCallback, useMemo } from 'react'

import { signInSocial } from '../auth-client'
import { useSocialProviders } from '../hooks/useSocialProviders'

export interface SocialAuthButtonsProps {
  className?: string
  title?: string
  requestSignUp?: boolean
  callbackURL?: string
  errorCallbackURL?: string
  newUserCallbackURL?: string
  disableRedirect?: boolean
  layout?: 'grid' | 'row'
}

export const SocialAuthButtons = memo(function SocialAuthButtons({
  className,
  title = 'Or continue with',
  requestSignUp = false,
  callbackURL,
  errorCallbackURL,
  newUserCallbackURL,
  disableRedirect,
  layout = 'grid',
}: SocialAuthButtonsProps) {
  const { data, isLoading } = useSocialProviders()

  const providers = data?.providers ?? []

  const resolvedCallbackURL = useMemo(() => {
    if (callbackURL) {
      return callbackURL
    }
    if (typeof window !== 'undefined') {
      return window.location.href
    }
    return
  }, [callbackURL])

  const handleSocialClick = useCallback(
    async (providerId: string) => {
      try {
        await signInSocial({
          provider: providerId,
          requestSignUp,
          callbackURL: resolvedCallbackURL,
          errorCallbackURL,
          newUserCallbackURL,
          disableRedirect,
        })
      } catch (error) {
        console.error('Failed to initiate social sign-in', error)
      }
    },
    [disableRedirect, errorCallbackURL, newUserCallbackURL, requestSignUp, resolvedCallbackURL],
  )

  if (isLoading) {
    return <div className={cx('text-text-tertiary text-xs italic', className)}>Loading available providers...</div>
  }

  if (providers.length === 0) {
    return null
  }

  const containerClass = layout === 'row' ? 'flex flex-wrap justify-center gap-3' : 'grid gap-2 sm:grid-cols-2'

  const providerIconColors: Record<string, string> = {
    github: 'text-[#181717] dark:text-white',
    google: 'text-[#4285F4]',
  }

  return (
    <div className={cx('space-y-3', className)}>
      {title ? <p className="text-text-tertiary text-xs uppercase tracking-wide">{title}</p> : null}
      <div className={containerClass}>
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={cx(
              'inline-flex items-center justify-center',
              'size-11 rounded-full',
              'border border-fill-tertiary bg-background',
              'transition-all duration-200',
              'hover:border-text/30 hover:bg-fill/50 hover:scale-110',
              'active:scale-95',
              'focus:outline-none focus:ring-2 focus:ring-accent/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            onClick={() => handleSocialClick(provider.id)}
            title={`Continue with ${provider.name}`}
            aria-label={`Continue with ${provider.name}`}
          >
            <i className={cx('text-xl', provider.icon, providerIconColors[provider.id] || 'text-text')} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
})
