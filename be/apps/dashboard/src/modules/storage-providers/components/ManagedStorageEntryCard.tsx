import { Button, Modal } from '@afilmory/ui'
import { DynamicIcon } from 'lucide-react/dynamic'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { useManagedStoragePlansQuery } from '~/modules/storage-plans'

import { ManagedStoragePlansModal } from './ManagedStoragePlansModal'

const managedStorageI18nKeys = {
  title: 'photos.storage.managed.title',
  description: 'photos.storage.managed.description',
  unavailable: 'photos.storage.managed.unavailable',
  empty: 'photos.storage.managed.empty',
  action: 'photos.storage.managed.actions.subscribe',
  seePlans: 'photos.storage.managed.actions.switch',
  loading: 'photos.storage.managed.actions.loading',
  subscribed: 'photos.storage.managed.actions.subscribed',
  upgrade: 'photos.storage.managed.actions.upgrade',
  makeActive: 'photos.storage.managed.actions.make-active',
  makeInactive: 'photos.storage.managed.actions.make-inactive',
} as const

type ManagedStorageEntryCardProps = {
  isActive?: boolean
  canToggle?: boolean
  onMakeActive?: () => void
  onMakeInactive?: () => void
}

export function ManagedStorageEntryCard({
  isActive,
  canToggle,
  onMakeActive,
  onMakeInactive,
}: ManagedStorageEntryCardProps) {
  const { t } = useTranslation()
  const plansQuery = useManagedStoragePlansQuery()

  const openModal = () => {
    Modal.present(ManagedStoragePlansModal, {}, { dismissOnOutsideClick: true })
  }

  const currentPlan = plansQuery.data?.currentPlan ?? null

  const capacityLabel = (() => {
    const val = currentPlan?.capacityBytes ?? null
    if (val === null) return t('photos.storage.managed.capacity.unlimited')
    if (val === undefined || Number.isNaN(val)) return t('photos.storage.managed.capacity.unknown')
    const gb = val / 1024 ** 3
    return `${t(managedStorageI18nKeys.subscribed)}: ${gb.toFixed(0)} GB`
  })()

  return (
    <m.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="group relative flex h-full flex-col gap-3 overflow-hidden bg-background-tertiary p-5 text-left transition-all duration-200 hover:shadow-lg">
        <div className="via-text/20 group-hover:via-accent/40 absolute top-0 right-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent transition-opacity" />
        <div className="via-text/20 group-hover:via-accent/40 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent transition-opacity" />
        <div className="via-text/20 group-hover:via-accent/40 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent transition-opacity" />
        <div className="via-text/20 group-hover:via-accent/40 absolute top-0 bottom-0 left-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent transition-opacity" />

        <div className="relative">
          <div className="bg-accent/15 inline-flex h-12 w-12 items-center justify-center rounded-lg">
            <DynamicIcon name="hard-drive" className="h-6 w-6 text-accent" />
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <h3 className="text-text text-sm font-semibold">{t(managedStorageI18nKeys.title)}</h3>
          <p className="text-text-tertiary text-xs">
            {currentPlan ? capacityLabel : t(managedStorageI18nKeys.description)}
          </p>
        </div>
        {/* 
        <div className="text-text-tertiary/80 text-xs">
          {plansQuery.isLoading
            ? t(managedStorageI18nKeys.loading)
            : plansQuery.isError
              ? t(managedStorageI18nKeys.unavailable)
              : plansQuery.data?.managedStorageEnabled
                ? t(managedStorageI18nKeys.seePlans)
                : t(managedStorageI18nKeys.unavailable)}
        </div> */}

        <div className="flex justify-end gap-2 -mb-3 -mt-2 -mr-3.5">
          {currentPlan ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={plansQuery.isLoading || plansQuery.isError}
                onClick={openModal}
              >
                {t(managedStorageI18nKeys.upgrade)}
              </Button>
              {canToggle && isActive && onMakeInactive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={plansQuery.isLoading || plansQuery.isError}
                  onClick={onMakeInactive}
                >
                  {t(managedStorageI18nKeys.makeInactive)}
                </Button>
              ) : null}
              {canToggle && !isActive && onMakeActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={plansQuery.isLoading || plansQuery.isError}
                  onClick={onMakeActive}
                >
                  {t(managedStorageI18nKeys.makeActive)}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  plansQuery.isLoading ||
                  plansQuery.isError ||
                  !plansQuery.data ||
                  (!plansQuery.data.managedStorageEnabled && plansQuery.data.availablePlans.length === 0)
                }
                onClick={openModal}
              >
                {t(managedStorageI18nKeys.action)}
              </Button>
              {canToggle && !isActive && onMakeActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    plansQuery.isLoading ||
                    plansQuery.isError ||
                    !plansQuery.data ||
                    (!plansQuery.data.managedStorageEnabled && plansQuery.data.availablePlans.length === 0)
                  }
                  onClick={onMakeActive}
                >
                  {t(managedStorageI18nKeys.makeActive)}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </m.div>
  )
}
