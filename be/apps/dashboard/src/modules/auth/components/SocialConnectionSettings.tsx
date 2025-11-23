import { Button } from '@afilmory/ui'
import { cx } from '@afilmory/utils'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { getRequestErrorMessage } from '~/lib/errors'

import type { SocialAccountRecord } from '../api/socialAccounts'
import {
  useLinkSocialAccountMutation,
  useSocialAccounts,
  useUnlinkSocialAccountMutation,
} from '../hooks/useSocialConnections'
import { useSocialProviders } from '../hooks/useSocialProviders'

export function SocialConnectionSettings() {
  const providersQuery = useSocialProviders()
  const accountsQuery = useSocialAccounts()
  const linkMutation = useLinkSocialAccountMutation()
  const unlinkMutation = useUnlinkSocialAccountMutation()
  const { t, i18n } = useTranslation()

  const providers = providersQuery.data?.providers ?? []
  const accountsByProvider = useMemo(() => {
    const map = new Map<string, SocialAccountRecord>()
    accountsQuery.data?.forEach((account) => {
      map.set(account.providerId, account)
    })
    return map
  }, [accountsQuery.data])

  const isLoading = providersQuery.isLoading || accountsQuery.isLoading
  const hasError = providersQuery.isError || accountsQuery.isError
  const errorMessage = useMemo(() => {
    if (providersQuery.isError && providersQuery.error) {
      return getRequestErrorMessage(providersQuery.error, t('auth.social.error.providers'))
    }
    if (accountsQuery.isError && accountsQuery.error) {
      return getRequestErrorMessage(accountsQuery.error, t('auth.social.error.accounts'))
    }
    return null
  }, [accountsQuery.error, accountsQuery.isError, providersQuery.error, providersQuery.isError])

  const linkingProvider = linkMutation.variables?.provider
  const unlinkingProvider = unlinkMutation.variables?.providerId
  const linkedAccountsCount = accountsQuery.data?.length ?? 0

  const handleConnect = useCallback(
    async (providerId: string, providerName: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set('auth-flow', 'link')
      url.searchParams.set('provider', providerId)

      try {
        const result = await linkMutation.mutateAsync({
          provider: providerId,
          callbackURL: url.toString(),
          errorCallbackURL: url.toString(),
        })

        if (result.redirect) {
          window.location.assign(result.url)
        } else {
          window.open(result.url, '_blank', 'noopener,noreferrer')
        }
      } catch (error) {
        toast.error(t('auth.social.toast.connect-failure', { provider: providerName }), {
          description: getRequestErrorMessage(error, t('common.retry-later')),
        })
      }
    },
    [linkMutation],
  )

  const handleDisconnect = useCallback(
    async (providerId: string, providerName: string, accountId?: string) => {
      try {
        await unlinkMutation.mutateAsync({ providerId, accountId })
        toast.success(t('auth.social.toast.disconnect-success', { provider: providerName }))
      } catch (error) {
        toast.error(t('auth.social.toast.disconnect-failure'), {
          description: getRequestErrorMessage(error, t('common.retry-later')),
        })
      }
    },
    [unlinkMutation],
  )

  if (isLoading) {
    return (
      <LinearBorderPanel className="p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <SkeletonBlock className="h-4 sm:h-5 w-2/5" />
          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3].map((key) => (
              <SkeletonBlock key={key} className="h-16 sm:h-20" />
            ))}
          </div>
        </div>
      </LinearBorderPanel>
    )
  }

  if (hasError && errorMessage) {
    return (
      <LinearBorderPanel className="p-4 sm:p-6">
        <div className="text-red flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <i className="i-mingcute-close-circle-fill text-base sm:text-lg" />
          <span>{errorMessage}</span>
        </div>
      </LinearBorderPanel>
    )
  }

  if (providers.length === 0) {
    return (
      <LinearBorderPanel className="p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:gap-3">
          <p className="text-sm sm:text-base font-semibold">{t('auth.social.empty.title')}</p>
          <p className="text-text-tertiary text-xs sm:text-sm">{t('auth.social.empty.description')}</p>
        </div>
      </LinearBorderPanel>
    )
  }

  return (
    <LinearBorderPanel className="p-4 sm:p-6">
      <div className="space-y-4 sm:space-y-6">
        <div>
          <p className="text-text-tertiary text-xs sm:text-sm font-semibold tracking-wide uppercase">
            {t('auth.social.section.label')}
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-semibold">{t('auth.social.section.title')}</h2>
          <p className="text-text-tertiary mt-1.5 sm:mt-2 text-xs sm:text-sm">{t('auth.social.section.description')}</p>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {providers.map((provider) => {
            const linkedAccount = accountsByProvider.get(provider.id)
            const isLinking = linkMutation.isPending && linkingProvider === provider.id
            const isUnlinking = unlinkMutation.isPending && unlinkingProvider === provider.id
            const isLastLinkedProvider = Boolean(linkedAccount) && linkedAccountsCount <= 1

            return (
              <div
                key={provider.id}
                className="flex bg-background-secondary rounded-md flex-col gap-3 sm:gap-4 p-3 sm:p-4 transition-colors md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-1 items-center gap-3 sm:gap-4">
                  <div className="bg-fill-secondary/60 text-text flex size-10 sm:size-12 items-center justify-center rounded-full shrink-0">
                    <i className={cx('text-xl sm:text-2xl', provider.icon)} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base leading-tight font-semibold">{provider.name}</p>
                    {linkedAccount ? (
                      <p className="text-text-tertiary mt-0.5 sm:mt-1 text-[11px] sm:text-xs">
                        {t('auth.social.provider.connected', {
                          time: formatTimestamp(linkedAccount.createdAt, i18n.language),
                        })}
                      </p>
                    ) : (
                      <p className="text-text-tertiary mt-0.5 sm:mt-1 text-[11px] sm:text-xs">
                        {t('auth.social.provider.unconnected')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-stretch sm:items-start gap-1.5 sm:gap-1 md:items-end w-full sm:w-auto">
                  {linkedAccount ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isUnlinking || isLastLinkedProvider}
                        isLoading={isUnlinking}
                        loadingText={t('auth.social.provider.disconnecting')}
                        onClick={() => handleDisconnect(provider.id, provider.name, linkedAccount.accountId)}
                        className="w-full sm:w-auto"
                      >
                        {t('auth.social.provider.disconnect')}
                      </Button>
                      {isLastLinkedProvider ? (
                        <p className="text-text-tertiary text-[11px] sm:text-xs">
                          {t('auth.social.provider.last-warning')}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isLinking}
                      isLoading={isLinking}
                      loadingText={t('auth.social.provider.connecting')}
                      onClick={() => handleConnect(provider.id, provider.name)}
                      className="w-full sm:w-auto"
                    >
                      {t('auth.social.provider.connect', { provider: provider.name })}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </LinearBorderPanel>
  )
}

function formatTimestamp(value: string, locale: string | undefined): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(locale ?? undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cx('bg-fill/40 animate-pulse rounded-2xl', className)} />
}
