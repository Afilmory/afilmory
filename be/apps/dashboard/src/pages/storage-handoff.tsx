import { Button, Modal } from '@afilmory/ui'
import { ArrowLeft, CheckCircle2, CloudCog, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { getRequestErrorMessage } from '~/lib/errors'
import type { StorageHandoffContext } from '~/modules/storage-handoff/api'
import {
  exchangeStorageHandoff,
  getStorageHandoffContext,
  saveStorageHandoff,
  testStorageHandoffProvider,
} from '~/modules/storage-handoff/api'
import { ProviderCard } from '~/modules/storage-providers/components/ProviderCard'
import { ProviderEditModal } from '~/modules/storage-providers/components/ProviderEditModal'
import type { StorageProvider } from '~/modules/storage-providers/types'
import { createEmptyProvider, parseStorageProviders } from '~/modules/storage-providers/utils'

type PageState = 'completed' | 'error' | 'loading' | 'ready'

export function Component() {
  const { t } = useTranslation()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<StorageHandoffContext | null>(null)
  const [providers, setProviders] = useState<StorageProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [validatedProviderId, setValidatedProviderId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [returnUrl, setReturnUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          await exchangeStorageHandoff(code)
          window.history.replaceState({}, document.title, window.location.pathname)
        }
        const next = await getStorageHandoffContext()
        if (cancelled) {
          return
        }
        const nextProviders = parseStorageProviders(next.values.builderStorageProviders ?? '[]')
        const active = next.values.builderStorageActiveProvider?.trim() || nextProviders[0]?.id || null
        setContext(next)
        setProviders(nextProviders)
        setActiveProviderId(active)
        setReturnUrl(next.returnUrl)
        setPageState('ready')
      }
      catch (reason) {
        if (cancelled) {
          return
        }
        setError(getRequestErrorMessage(reason, t('storage.handoff.error.invalid')))
        setPageState('error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [t])

  const activeProvider = useMemo(
    () => providers.find(provider => provider.id === activeProviderId) ?? null,
    [activeProviderId, providers],
  )

  const editProvider = (provider: StorageProvider | null) => {
    if (!context) {
      return
    }
    Modal.present(
      ProviderEditModal,
      {
        activeProviderId,
        provider,
        providerSchema: context.providerForm,
        onSave: (nextProvider) => {
          setProviders((current) => {
            const exists = current.some(item => item.id === nextProvider.id)
            return exists
              ? current.map(item => (item.id === nextProvider.id ? nextProvider : item))
              : [...current, nextProvider]
          })
          setActiveProviderId(nextProvider.id)
          setValidatedProviderId(null)
        },
        onSetActive: id => setActiveProviderId(id),
      },
      { dismissOnOutsideClick: false },
    )
  }

  const addProvider = () => {
    const type = context?.providerForm.types[0]?.value ?? 's3'
    editProvider(createEmptyProvider(type))
  }

  const testConnection = async () => {
    if (!activeProvider) {
      return
    }
    setTesting(true)
    try {
      await testStorageHandoffProvider(activeProvider)
      setValidatedProviderId(activeProvider.id)
      toast.success(t('storage.handoff.test.success'))
    }
    catch (reason) {
      setValidatedProviderId(null)
      toast.error(getRequestErrorMessage(reason, t('storage.handoff.test.failed')))
    }
    finally {
      setTesting(false)
    }
  }

  const save = async () => {
    if (!activeProviderId || validatedProviderId !== activeProviderId) {
      return
    }
    setSaving(true)
    try {
      const result = await saveStorageHandoff({ activeProviderId, providers })
      setReturnUrl(result.returnUrl)
      setPageState('completed')
      window.location.assign(result.returnUrl)
    }
    catch (reason) {
      toast.error(getRequestErrorMessage(reason, t('storage.handoff.save.failed')))
    }
    finally {
      setSaving(false)
    }
  }

  if (pageState === 'loading') {
    return (
      <HandoffShell>
        <div className="text-text-secondary py-24 text-center">{t('storage.handoff.loading')}</div>
      </HandoffShell>
    )
  }
  if (pageState === 'error') {
    return (
      <HandoffShell>
        <LinearBorderPanel className="mx-auto max-w-xl space-y-3 p-8 text-center">
          <h1 className="text-text text-xl font-semibold">{t('storage.handoff.error.title')}</h1>
          <p className="text-red text-sm">{error}</p>
        </LinearBorderPanel>
      </HandoffShell>
    )
  }
  if (pageState === 'completed') {
    return (
      <HandoffShell>
        <LinearBorderPanel className="mx-auto max-w-xl space-y-5 p-8 text-center">
          <CheckCircle2 className="text-accent mx-auto size-10" />
          <h1 className="text-text text-xl font-semibold">{t('storage.handoff.completed.title')}</h1>
          <p className="text-text-secondary text-sm">{t('storage.handoff.completed.description')}</p>
          {returnUrl ? (
            <Button onClick={() => window.location.assign(returnUrl)}>
              <ArrowLeft className="mr-2 size-4" />
              {t('storage.handoff.completed.return')}
            </Button>
          ) : null}
        </LinearBorderPanel>
      </HandoffShell>
    )
  }

  return (
    <HandoffShell>
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="text-accent flex items-center gap-2 text-sm font-medium">
            <CloudCog className="size-4" />
            {context?.workspace?.name ?? 'Afilmory'}
          </div>
          <h1 className="text-text text-2xl font-semibold">{t('storage.handoff.title')}</h1>
          <p className="text-text-secondary max-w-2xl text-sm">{t('storage.handoff.description')}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map(provider => (
            <ProviderCard
              key={provider.id}
              isActive={provider.id === activeProviderId}
              provider={provider}
              onEdit={() => editProvider(provider)}
              onToggleActive={() => {
                setActiveProviderId(provider.id)
                setValidatedProviderId(null)
              }}
            />
          ))}
          <button
            className="border-fill text-text-secondary hover:border-accent hover:text-text flex min-h-44 flex-col items-center justify-center gap-3 border border-dashed p-6 transition-colors"
            type="button"
            onClick={addProvider}
          >
            <Plus className="size-5" />
            {t('storage.handoff.add')}
          </button>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            disabled={!activeProvider || testing || saving}
            isLoading={testing}
            variant="secondary"
            onClick={testConnection}
          >
            {validatedProviderId === activeProviderId
              ? t('storage.handoff.test.verified')
              : t('storage.handoff.test.action')}
          </Button>
          <Button
            disabled={!activeProviderId || validatedProviderId !== activeProviderId || saving}
            isLoading={saving}
            onClick={save}
          >
            {t('storage.handoff.save.action')}
          </Button>
        </div>
      </div>
    </HandoffShell>
  )
}

function HandoffShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background min-h-screen px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  )
}
