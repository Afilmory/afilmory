import { Button, Prompt } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { usePhotoAssetSummaryQuery } from '~/modules/photos/hooks'

import { useDeleteTenantAccountMutation, useTruncatePhotoAssetsMutation } from '../hooks'

const SUMMARY_PLACEHOLDER = {
  total: 0,
  synced: 0,
  pending: 0,
  conflicts: 0,
}

const SUMMARY_STATS = [
  {
    id: 'total',
    labelKey: 'data-management.summary.stats.total.label',
    chipKey: 'data-management.summary.stats.total.chip',
    accent: 'text-text',
  },
  {
    id: 'synced',
    labelKey: 'data-management.summary.stats.synced.label',
    chipKey: 'data-management.summary.stats.synced.chip',
    accent: 'text-emerald-300',
  },
  {
    id: 'pending',
    labelKey: 'data-management.summary.stats.pending.label',
    chipKey: 'data-management.summary.stats.pending.chip',
    accent: 'text-amber-300',
  },
  {
    id: 'conflicts',
    labelKey: 'data-management.summary.stats.conflicts.label',
    chipKey: 'data-management.summary.stats.conflicts.chip',
    accent: 'text-rose-300',
  },
] as const satisfies readonly {
  id: keyof typeof SUMMARY_PLACEHOLDER
  labelKey: I18nKeys
  chipKey: I18nKeys
  accent: string
}[]

const dataManagementKeys = {
  summary: {
    badge: 'data-management.summary.badge',
    title: 'data-management.summary.title',
    description: 'data-management.summary.description',
    error: 'data-management.summary.error',
  },
  truncate: {
    badge: 'data-management.truncate.badge',
    title: 'data-management.truncate.title',
    description: 'data-management.truncate.description',
    note: 'data-management.truncate.note',
    button: 'data-management.truncate.button',
    loading: 'data-management.truncate.loading',
    prompt: {
      title: 'data-management.truncate.prompt.title',
      description: 'data-management.truncate.prompt.description',
      confirm: 'data-management.truncate.prompt.confirm',
      cancel: 'data-management.truncate.prompt.cancel',
    },
  },
  delete: {
    badge: 'data-management.delete.badge',
    title: 'data-management.delete.title',
    description: 'data-management.delete.description',
    note: 'data-management.delete.note',
    button: 'data-management.delete.button',
    loading: 'data-management.delete.loading',
    promptInitial: {
      title: 'data-management.delete.step1.title',
      description: 'data-management.delete.step1.description',
      confirm: 'data-management.delete.step1.confirm',
      cancel: 'data-management.delete.step1.cancel',
    },
    promptConfirm: {
      title: 'data-management.delete.step2.title',
      description: 'data-management.delete.step2.description',
      confirm: 'data-management.delete.step2.confirm',
      cancel: 'data-management.delete.step2.cancel',
    },
    promptFinal: {
      title: 'data-management.delete.step3.title',
      description: 'data-management.delete.step3.description',
      placeholder: 'data-management.delete.step3.placeholder',
      confirm: 'data-management.delete.step3.confirm',
      cancel: 'data-management.delete.step3.cancel',
      errorTitle: 'data-management.delete.step3.error.title',
      errorDescription: 'data-management.delete.step3.error.description',
    },
  },
} as const satisfies {
  summary: {
    badge: I18nKeys
    title: I18nKeys
    description: I18nKeys
    error: I18nKeys
  }
  truncate: {
    badge: I18nKeys
    title: I18nKeys
    description: I18nKeys
    note: I18nKeys
    button: I18nKeys
    loading: I18nKeys
    prompt: {
      title: I18nKeys
      description: I18nKeys
      confirm: I18nKeys
      cancel: I18nKeys
    }
  }
  delete: {
    badge: I18nKeys
    title: I18nKeys
    description: I18nKeys
    note: I18nKeys
    button: I18nKeys
    loading: I18nKeys
    promptInitial: { title: I18nKeys; description: I18nKeys; confirm: I18nKeys; cancel: I18nKeys }
    promptConfirm: { title: I18nKeys; description: I18nKeys; confirm: I18nKeys; cancel: I18nKeys }
    promptFinal: {
      title: I18nKeys
      description: I18nKeys
      placeholder: I18nKeys
      confirm: I18nKeys
      cancel: I18nKeys
      errorTitle: I18nKeys
      errorDescription: I18nKeys
    }
  }
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

export function DataManagementPanel() {
  const { t } = useTranslation()
  const summaryQuery = usePhotoAssetSummaryQuery()
  const summary = summaryQuery.data ?? SUMMARY_PLACEHOLDER
  const truncateMutation = useTruncatePhotoAssetsMutation()
  const deleteTenantMutation = useDeleteTenantAccountMutation()

  const handleTruncate = () => {
    if (truncateMutation.isPending) {
      return
    }

    Prompt.prompt({
      title: t(dataManagementKeys.truncate.prompt.title),
      description: t(dataManagementKeys.truncate.prompt.description),
      variant: 'danger',
      onConfirmText: t(dataManagementKeys.truncate.prompt.confirm),
      onCancelText: t(dataManagementKeys.truncate.prompt.cancel),
      onConfirm: () => truncateMutation.mutateAsync().then(() => {}),
    })
  }

  const handleDeleteAccount = () => {
    if (deleteTenantMutation.isPending) {
      return
    }

    const launchFinalConfirm = () => {
      Prompt.input({
        title: t(dataManagementKeys.delete.promptFinal.title),
        description: t(dataManagementKeys.delete.promptFinal.description),
        placeholder: t(dataManagementKeys.delete.promptFinal.placeholder),
        variant: 'danger',
        onConfirmText: t(dataManagementKeys.delete.promptFinal.confirm),
        onCancelText: t(dataManagementKeys.delete.promptFinal.cancel),
        onConfirm: async (value) => {
          const normalized = value.trim().toUpperCase()
          if (normalized !== 'DELETE') {
            toast.error(t(dataManagementKeys.delete.promptFinal.errorTitle), {
              description: t(dataManagementKeys.delete.promptFinal.errorDescription),
            })
            launchFinalConfirm()
            return
          }
          if (deleteTenantMutation.isPending) {
            return
          }
          await deleteTenantMutation.mutateAsync()
        },
      })
    }

    const confirmIrreversibleStep = () => {
      Prompt.prompt({
        title: t(dataManagementKeys.delete.promptConfirm.title),
        description: t(dataManagementKeys.delete.promptConfirm.description),
        variant: 'danger',
        onConfirmText: t(dataManagementKeys.delete.promptConfirm.confirm),
        onCancelText: t(dataManagementKeys.delete.promptConfirm.cancel),
        onConfirm: launchFinalConfirm,
      })
    }

    Prompt.prompt({
      title: t(dataManagementKeys.delete.promptInitial.title),
      description: t(dataManagementKeys.delete.promptInitial.description),
      variant: 'danger',
      onConfirmText: t(dataManagementKeys.delete.promptInitial.confirm),
      onCancelText: t(dataManagementKeys.delete.promptInitial.cancel),
      onConfirm: confirmIrreversibleStep,
    })
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <LinearBorderPanel className="bg-background-secondary/40 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 sm:space-y-4">
            <span className="shape-squircle inline-flex items-center gap-2 bg-accent/10 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium text-accent">
              <DynamicIcon name="database" className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              {t(dataManagementKeys.summary.badge)}
            </span>
            <div className="space-y-1.5 sm:space-y-2">
              <h3 className="text-text text-lg sm:text-xl font-semibold">{t(dataManagementKeys.summary.title)}</h3>
              <p className="text-text-secondary text-xs sm:text-sm">{t(dataManagementKeys.summary.description)}</p>
            </div>
            {summaryQuery.isError ? (
              <p className="text-red text-xs sm:text-sm">{t(dataManagementKeys.summary.error)}</p>
            ) : null}
          </div>
          <div className="grid w-full gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            {SUMMARY_STATS.map((stat) => (
              <LinearBorderPanel
                key={stat.id}
                className={clsxm(
                  'bg-background-tertiary/60 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm backdrop-blur',
                  summaryQuery.isLoading && 'animate-pulse',
                )}
              >
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-text-tertiary">
                  <span>{t(stat.labelKey)}</span>
                  <span className="shape-squircle bg-white/5 px-1.5 sm:px-2 py-0.5 font-medium text-white/80 text-[9px] sm:text-[10px]">
                    {t(stat.chipKey)}
                  </span>
                </div>
                <div className={clsxm('mt-1.5 sm:mt-2 text-xl sm:text-2xl font-semibold', stat.accent)}>
                  {summaryQuery.isLoading ? '—' : numberFormatter.format(summary[stat.id])}
                </div>
              </LinearBorderPanel>
            ))}
          </div>
        </div>
      </LinearBorderPanel>

      <LinearBorderPanel className="bg-background-secondary/40 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-red">
              <DynamicIcon name="triangle-alert" className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              <span className="text-xs sm:text-sm font-semibold">{t(dataManagementKeys.truncate.badge)}</span>
            </div>
            <div>
              <h4 className="text-text text-base sm:text-lg font-semibold">{t(dataManagementKeys.truncate.title)}</h4>
              <p className="text-text-secondary text-xs sm:text-sm">{t(dataManagementKeys.truncate.description)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            isLoading={truncateMutation.isPending}
            loadingText={t(dataManagementKeys.truncate.loading)}
            onClick={handleTruncate}
            className="w-full sm:w-auto"
          >
            {t(dataManagementKeys.truncate.button)}
          </Button>
        </div>
        <p className="text-text-tertiary mt-3 sm:mt-4 text-[11px] sm:text-xs">{t(dataManagementKeys.truncate.note)}</p>
      </LinearBorderPanel>

      <LinearBorderPanel className="bg-red-500/5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-red">
              <DynamicIcon name="radiation" className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              <span className="text-xs sm:text-sm font-semibold">{t(dataManagementKeys.delete.badge)}</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-text text-base sm:text-lg font-semibold">{t(dataManagementKeys.delete.title)}</h4>
              <p className="text-text-secondary text-xs sm:text-sm">{t(dataManagementKeys.delete.description)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeleteAccount}
            loadingText={t(dataManagementKeys.delete.loading)}
            isLoading={deleteTenantMutation.isPending}
            className="w-full sm:w-auto"
          >
            {t(dataManagementKeys.delete.button)}
          </Button>
        </div>
        <p className="text-text-tertiary mt-3 sm:mt-4 text-[11px] sm:text-xs">{t(dataManagementKeys.delete.note)}</p>
      </LinearBorderPanel>
    </div>
  )
}
