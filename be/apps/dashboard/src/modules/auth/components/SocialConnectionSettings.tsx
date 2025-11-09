import { Button } from '@afilmory/ui'
import { cx } from '@afilmory/utils'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/GlassPanel'

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
      return providersQuery.error instanceof Error ? providersQuery.error.message : '无法加载可用的 OAuth Provider'
    }
    if (accountsQuery.isError && accountsQuery.error) {
      return accountsQuery.error instanceof Error ? accountsQuery.error.message : '无法查询绑定状态'
    }
    return null
  }, [accountsQuery.error, accountsQuery.isError, providersQuery.error, providersQuery.isError])

  const linkingProvider = linkMutation.variables?.provider
  const unlinkingProvider = unlinkMutation.variables?.providerId

  const handleConnect = useCallback(
    async (providerId: string, providerName: string) => {
      if (typeof window === 'undefined') {
        toast.error('当前环境不支持 OAuth 绑定')
        return
      }

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
        toast.error(`无法开启 ${providerName} 绑定`, {
          description: error instanceof Error ? error.message : '请稍后再试',
        })
      }
    },
    [linkMutation],
  )

  const handleDisconnect = useCallback(
    async (providerId: string, providerName: string, accountId?: string) => {
      try {
        await unlinkMutation.mutateAsync({ providerId, accountId })
        toast.success(`已解除与 ${providerName} 的绑定`)
      } catch (error) {
        toast.error('解绑失败', {
          description: error instanceof Error ? error.message : '请稍后再试',
        })
      }
    },
    [unlinkMutation],
  )

  if (isLoading) {
    return (
      <LinearBorderPanel className="p-6">
        <div className="space-y-6">
          <SkeletonBlock className="h-5 w-2/5" />
          <div className="space-y-4">
            {[1, 2, 3].map((key) => (
              <SkeletonBlock key={key} className="h-20" />
            ))}
          </div>
        </div>
      </LinearBorderPanel>
    )
  }

  if (hasError && errorMessage) {
    return (
      <LinearBorderPanel className="p-6">
        <div className="flex items-center gap-3 text-sm text-red">
          <i className="i-mingcute-close-circle-fill text-lg" />
          <span>{errorMessage}</span>
        </div>
      </LinearBorderPanel>
    )
  }

  if (providers.length === 0) {
    return (
      <LinearBorderPanel className="p-6">
        <div className="flex flex-col gap-3">
          <p className="text-base font-semibold">未配置可用的 OAuth Provider</p>
          <p className="text-sm text-text-tertiary">
            超级管理员尚未在系统设置中启用任何第三方登录方式，当前租户无法执行 OAuth 绑定。
          </p>
        </div>
      </LinearBorderPanel>
    )
  }

  return (
    <LinearBorderPanel className="p-6">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">登录方式</p>
          <h2 className="mt-1 text-2xl font-semibold">OAuth 账号绑定</h2>
          <p className="mt-2 text-sm text-text-tertiary">
            绑定后即可使用对应平台的账号快速登录后台，并同步基础资料。解除绑定不会删除原有后台账号。
          </p>
        </div>

        <div className="space-y-4">
          {providers.map((provider) => {
            const linkedAccount = accountsByProvider.get(provider.id)
            const isLinking = linkMutation.isPending && linkingProvider === provider.id
            const isUnlinking = unlinkMutation.isPending && unlinkingProvider === provider.id

            return (
              <div
                key={provider.id}
                className="border-text/10 bg-fill/30 hover:bg-fill/40 flex flex-col gap-4 rounded-2xl border p-4 transition-colors md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-1 items-center gap-4">
                  <div className="bg-fill-secondary/60 text-text flex size-12 items-center justify-center rounded-full">
                    <i className={cx('text-2xl', provider.icon)} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight">{provider.name}</p>
                    {linkedAccount ? (
                      <p className="text-text-tertiary mt-1 text-xs">
                        已绑定 · {formatTimestamp(linkedAccount.createdAt)}
                      </p>
                    ) : (
                      <p className="text-text-tertiary mt-1 text-xs">尚未绑定，点击下方按钮完成授权。</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  {linkedAccount ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isUnlinking}
                      isLoading={isUnlinking}
                      loadingText="解绑中…"
                      onClick={() => handleDisconnect(provider.id, provider.name, linkedAccount.accountId)}
                    >
                      解除绑定
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isLinking}
                      isLoading={isLinking}
                      loadingText="跳转中…"
                      onClick={() => handleConnect(provider.id, provider.name)}
                    >
                      绑定 {provider.name}
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

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
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
