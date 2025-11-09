import { Button, Modal } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useEffect, useState } from 'react'

import { MainPageLayout, useMainPageLayout } from '~/components/layouts/MainPageLayout'
import { useBlock } from '~/hooks/useBlock'

import { useStorageProvidersQuery, useUpdateStorageProvidersMutation } from '../hooks'
import type { StorageProvider } from '../types'
import { createEmptyProvider, reorderProvidersByActive } from '../utils'
import { ProviderCard } from './ProviderCard'
import { ProviderEditModal } from './ProviderEditModal'

export function StorageProvidersManager() {
  const { data, isLoading, isError, error } = useStorageProvidersQuery()
  const updateMutation = useUpdateStorageProvidersMutation()
  const { setHeaderActionState } = useMainPageLayout()

  const [providers, setProviders] = useState<StorageProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useBlock({
    when: isDirty,
    title: '离开前请保存设置',
    description: '当前存储提供商设置尚未保存，离开页面会丢失这些更改，确定要继续吗？',
    confirmText: '继续离开',
    cancelText: '留在此页',
  })

  useEffect(() => {
    if (!data) {
      return
    }

    const initialProviders = data.providers
    const activeId = data.activeProviderId ?? (initialProviders.length > 0 ? initialProviders[0].id : null)

    startTransition(() => {
      setProviders(initialProviders)
      setActiveProviderId(activeId)
      setIsDirty(false)
    })
  }, [data])

  const orderedProviders = reorderProvidersByActive(providers, activeProviderId)

  const markDirty = () => setIsDirty(true)

  const handleEditProvider = (provider: StorageProvider | null) => {
    Modal.present(ProviderEditModal, {
      provider,
      activeProviderId,
      onSave: handleSaveProvider,
      onSetActive: handleSetActive,
    })
  }

  const handleAddProvider = () => {
    const newProvider = createEmptyProvider('s3')
    handleEditProvider(newProvider)
  }

  const handleSaveProvider = (updatedProvider: StorageProvider) => {
    setProviders((prev) => {
      const exists = prev.some((p) => p.id === updatedProvider.id)
      if (exists) {
        return prev.map((p) => (p.id === updatedProvider.id ? updatedProvider : p))
      }
      // New provider
      const result = [...prev, updatedProvider]
      // Set as active ONLY if it's the very first provider
      if (prev.length === 0) {
        setActiveProviderId(updatedProvider.id)
      }
      return result
    })
    markDirty()
  }

  const handleSetActive = (providerId: string) => {
    setActiveProviderId(providerId)
    markDirty()
  }

  const handleSave = () => {
    const resolvedActiveId =
      activeProviderId && providers.some((provider) => provider.id === activeProviderId) ? activeProviderId : null

    updateMutation.mutate(
      {
        providers,
        activeProviderId: resolvedActiveId,
      },
      {
        onSuccess: () => {
          setIsDirty(false)
        },
      },
    )
  }

  const disableSave = isLoading || isError || !isDirty || updateMutation.isPending || providers.length === 0
  useEffect(() => {
    setHeaderActionState((prev) => {
      const nextState = {
        disabled: disableSave,
        loading: updateMutation.isPending,
      }
      return prev.disabled === nextState.disabled && prev.loading === nextState.loading ? prev : nextState
    })

    return () => {
      setHeaderActionState({ disabled: false, loading: false })
    }
  }, [disableSave, setHeaderActionState, updateMutation.isPending])

  const headerActionPortal = (
    <MainPageLayout.Actions>
      <Button type="button" onClick={handleAddProvider} size="sm" variant="secondary">
        新增提供商
      </Button>
      <Button
        type="button"
        onClick={handleSave}
        disabled={disableSave}
        isLoading={updateMutation.isPending}
        loadingText="保存中…"
        variant="primary"
        size="sm"
      >
        保存修改
      </Button>
    </MainPageLayout.Actions>
  )

  if (isLoading && !data) {
    return (
      <>
        {headerActionPortal}
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={Spring.presets.smooth}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-background-tertiary h-[180px] animate-pulse rounded" />
          ))}
        </m.div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {headerActionPortal}
        <div className="bg-background-tertiary text-red flex items-center justify-center gap-3 rounded p-8 text-sm">
          <span>
            无法加载存储配置：
            <span>{error instanceof Error ? error.message : '未知错误'}</span>
          </span>
        </div>
      </>
    )
  }

  const hasProviders = providers.length > 0

  return (
    <>
      {headerActionPortal}
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={Spring.presets.smooth}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {orderedProviders.map((provider, index) => (
          <m.div
            key={provider.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.05 }}
          >
            <ProviderCard
              provider={provider}
              isActive={provider.id === activeProviderId}
              onEdit={() => handleEditProvider(provider)}
              onToggleActive={() => {
                setActiveProviderId((prev) => (prev === provider.id ? null : provider.id))
                markDirty()
              }}
            />
          </m.div>
        ))}
      </m.div>

      {/* Status Message */}
      {hasProviders && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...Spring.presets.smooth, delay: 0.2 }}
          className="mt-4 text-center"
        >
          <p className="text-text-tertiary text-xs">
            <span>
              {updateMutation.isError && updateMutation.error
                ? `保存失败：${updateMutation.error instanceof Error ? updateMutation.error.message : '未知错误'}`
                : updateMutation.isSuccess && !isDirty
                  ? '✓ 配置已保存并同步'
                  : isDirty
                    ? `有未保存的更改 • ${providers.length} 个提供商`
                    : `${providers.length} 个存储提供商 • ${orderedProviders.find((p) => p.id === activeProviderId)?.name || 'N/A'} 当前激活`}
            </span>
          </p>
        </m.div>
      )}
    </>
  )
}
