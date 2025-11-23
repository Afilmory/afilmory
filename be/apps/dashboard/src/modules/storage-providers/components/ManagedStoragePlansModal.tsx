import type { ModalComponent } from '@afilmory/ui'
import { Button, DialogDescription, DialogHeader, DialogTitle } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getI18n } from '~/i18n'
import type { SessionResponse } from '~/modules/auth/api/session'
import { AUTH_SESSION_QUERY_KEY } from '~/modules/auth/api/session'
import { authClient } from '~/modules/auth/auth-client'
import { buildCheckoutSuccessUrl } from '~/modules/billing/creem-utils'
import type { ManagedStoragePlanSummary } from '~/modules/storage-plans'
import { useManagedStoragePlansQuery } from '~/modules/storage-plans'

const managedStorageI18nKeys = {
  title: 'photos.storage.managed.title',
  description: 'photos.storage.managed.description',
  unavailable: 'photos.storage.managed.unavailable',
  empty: 'photos.storage.managed.empty',
  capacityLabel: 'photos.storage.managed.capacity.label',
  capacityUnlimited: 'photos.storage.managed.capacity.unlimited',
  capacityUnknown: 'photos.storage.managed.capacity.unknown',
  priceLabel: 'photos.storage.managed.price.label',
  priceFree: 'photos.storage.managed.price.free',
  actionsSubscribe: 'photos.storage.managed.actions.subscribe',
  actionsSwitch: 'photos.storage.managed.actions.switch',
  actionsCurrent: 'photos.storage.managed.actions.current',
  actionsCancel: 'photos.storage.managed.actions.cancel',
  actionsLoading: 'photos.storage.managed.actions.loading',
  actionsManage: 'photos.storage.managed.actions.manage',
  errorLoad: 'photos.storage.managed.error.load',
  toastSuccess: 'photos.storage.managed.toast.success',
  toastError: 'photos.storage.managed.toast.error',
  toastCheckoutFailure: 'photos.storage.managed.toast.checkout-failure',
  toastMissingCheckoutUrl: 'photos.storage.managed.toast.missing-checkout-url',
  toastPortalFailure: 'photos.storage.managed.toast.portal-failure',
  toastMissingPortalUrl: 'photos.storage.managed.toast.missing-portal-url',
  toastCheckoutUnavailable: 'photos.storage.managed.toast.checkout-unavailable',
} as const

export const ManagedStoragePlansModal: ModalComponent = () => {
  const { t } = useTranslation()
  const plansQuery = useManagedStoragePlansQuery()
  const queryClient = useQueryClient()
  const session = (queryClient.getQueryData<SessionResponse | null>(AUTH_SESSION_QUERY_KEY) ??
    null) as SessionResponse | null
  const tenantId = session?.tenant?.id ?? null
  const tenantSlug = session?.tenant?.slug ?? null
  const creemCustomerId = session?.user?.creemCustomerId ?? null
  const [activeAction, setActiveAction] = useState<string | null>(null)

  const handleCheckout = async (plan: ManagedStoragePlanSummary) => {
    const productId = plan.payment?.creemProductId ?? null
    if (!tenantId || !productId) {
      toast.error(t(managedStorageI18nKeys.toastCheckoutUnavailable))
      return
    }
    const successUrl = buildCheckoutSuccessUrl(tenantSlug)
    const metadata: Record<string, string> = { tenantId, storagePlanId: plan.id }
    if (tenantSlug) {
      metadata.tenantSlug = tenantSlug
    }

    setActiveAction(plan.id)
    try {
      const { data, error } = await authClient.creem.createCheckout({
        productId,
        successUrl,
        metadata,
      })
      if (error) {
        throw new Error(error.message ?? t(managedStorageI18nKeys.toastCheckoutFailure))
      }
      if (data?.url) {
        window.location.href = data.url
        return
      }
      toast.error(t(managedStorageI18nKeys.toastMissingCheckoutUrl))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(managedStorageI18nKeys.toastCheckoutFailure))
    } finally {
      setActiveAction(null)
    }
  }

  const handlePortal = async () => {
    if (!creemCustomerId) {
      toast.error(t(managedStorageI18nKeys.toastCheckoutUnavailable))
      return
    }
    setActiveAction('portal')
    try {
      const { data, error } = await authClient.creem.createPortal({ customerId: creemCustomerId })
      if (error) {
        throw new Error(error.message ?? t(managedStorageI18nKeys.toastPortalFailure))
      }
      if (data?.url) {
        window.location.href = data.url
        return
      }
      toast.error(t(managedStorageI18nKeys.toastMissingPortalUrl))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(managedStorageI18nKeys.toastPortalFailure))
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <div className="flex h-full max-h-[85vh] flex-col">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold leading-none tracking-tight">
          {t(managedStorageI18nKeys.title)}
        </DialogTitle>
        <DialogDescription className="text-text-secondary text-sm">
          {t(managedStorageI18nKeys.description)}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-6 space-y-4">
        {plansQuery.isLoading ? (
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => `skeleton-${index}`).map((key) => (
              <div key={key} className="bg-background-tertiary h-64 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : plansQuery.isError ? (
          <div className="rounded-lg border border-red/30 bg-red/10 p-4 text-sm text-red">
            {t(managedStorageI18nKeys.errorLoad)}
          </div>
        ) : !plansQuery.data?.managedStorageEnabled ? (
          <div className="rounded-lg border border-fill-tertiary bg-background-tertiary p-4 text-sm text-text-secondary">
            {t(managedStorageI18nKeys.unavailable)}
          </div>
        ) : plansQuery.data.availablePlans.length === 0 ? (
          <div className="rounded-lg border border-fill-tertiary bg-background-tertiary p-4 text-sm text-text-secondary">
            {t(managedStorageI18nKeys.empty)}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {plansQuery.data.availablePlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={plansQuery.data?.currentPlanId === plan.id}
                hasCurrentPlan={Boolean(plansQuery.data?.currentPlanId)}
                isProcessing={activeAction !== null}
                onCheckout={() => handleCheckout(plan)}
                onPortal={handlePortal}
                canCheckout={Boolean(plan.payment?.creemProductId && tenantId)}
                canManage={Boolean(
                  plansQuery.data?.currentPlanId === plan.id && plan.payment?.creemProductId && creemCustomerId,
                )}
                isActiveAction={activeAction === plan.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

ManagedStoragePlansModal.contentClassName = 'w-[700px] max-w-[85vw]'
function PlanCard({
  plan,
  isCurrent,
  hasCurrentPlan,
  isProcessing,
  onCheckout,
  onPortal,
  canCheckout,
  canManage,
  isActiveAction,
}: {
  plan: ManagedStoragePlanSummary
  isCurrent: boolean
  hasCurrentPlan: boolean
  isProcessing: boolean
  onCheckout: () => void
  onPortal: () => void
  canCheckout: boolean
  canManage: boolean
  isActiveAction: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'

  const { priceFormatter, numberFormatter } = useMemo(() => {
    return {
      priceFormatter: new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      numberFormatter: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    }
  }, [locale])

  const hasPrice =
    plan.pricing &&
    plan.pricing.monthlyPrice !== null &&
    plan.pricing.monthlyPrice !== undefined &&
    Number.isFinite(plan.pricing.monthlyPrice)

  const priceLabel = hasPrice
    ? t(managedStorageI18nKeys.priceLabel, {
        price: formatPrice(plan.pricing!.monthlyPrice as number, plan.pricing!.currency ?? null, priceFormatter),
      })
    : t(managedStorageI18nKeys.priceFree)

  const capacityLabel = formatCapacity(plan.capacityBytes, numberFormatter)
  const actionLabel = isCurrent
    ? t(managedStorageI18nKeys.actionsCurrent)
    : hasCurrentPlan
      ? t(managedStorageI18nKeys.actionsSwitch)
      : t(managedStorageI18nKeys.actionsSubscribe)

  const isPaidPlan = Boolean(plan.payment?.creemProductId)
  const showManage = isCurrent && canManage
  const primaryAction = showManage ? onPortal : onCheckout
  const primaryLabel = showManage ? t(managedStorageI18nKeys.actionsManage) : actionLabel
  const shouldDisable = isProcessing || (isPaidPlan && !canCheckout) || (isCurrent && !showManage && isPaidPlan)

  return (
    <div
      className={clsxm(
        'border-fill-tertiary bg-background-tertiary flex h-full flex-col rounded-lg border transition-all duration-200',
        isCurrent && 'border-accent/60 bg-background',
        !isCurrent && 'hover:border-fill-secondary',
      )}
    >
      {/* Header Section */}
      <div className="border-fill-tertiary flex items-start justify-between gap-3 border-b p-5">
        <div className="flex-1 min-w-0">
          <h3 className="text-text text-lg font-semibold leading-tight">{plan.name}</h3>
          {plan.description ? (
            <p className="text-text-tertiary mt-2 text-sm leading-relaxed whitespace-pre-line">{plan.description}</p>
          ) : null}
        </div>
        {isCurrent ? (
          <span className="text-accent border-accent/40 bg-accent/10 shrink-0 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap">
            {t(managedStorageI18nKeys.actionsCurrent)}
          </span>
        ) : null}
      </div>

      {/* Features Section */}
      <div className="flex-1 p-5 space-y-4">
        <div>
          <p className="text-text-secondary mb-1.5 text-xs font-medium uppercase tracking-wider">Capacity</p>
          <p className="text-text text-base font-semibold">{capacityLabel}</p>
        </div>
        <div>
          <p className="text-text-secondary mb-1.5 text-xs font-medium uppercase tracking-wider">Price</p>
          <p className="text-text text-base font-semibold">{priceLabel}</p>
        </div>
      </div>

      {/* Action Button */}
      <div className="border-fill-tertiary border-t p-5">
        <Button
          type="button"
          className="w-full"
          variant={isCurrent ? 'secondary' : 'primary'}
          disabled={shouldDisable}
          onClick={primaryAction}
        >
          {isProcessing && isActiveAction ? t(managedStorageI18nKeys.actionsLoading) : primaryLabel}
        </Button>
      </div>
    </div>
  )
}

function formatCapacity(bytes: number | null, formatter: Intl.NumberFormat) {
  const { t } = getI18n()
  if (bytes === null) {
    return t(managedStorageI18nKeys.capacityUnlimited)
  }
  if (bytes === undefined || bytes <= 0 || Number.isNaN(bytes)) {
    return t(managedStorageI18nKeys.capacityUnknown)
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const formattedValue = formatter.format(value >= 10 ? Math.round(value) : value)
  return t(managedStorageI18nKeys.capacityLabel, { value: `${formattedValue} ${units[exponent]}` })
}

function formatPrice(value: number, currency: string | null | undefined, formatter: Intl.NumberFormat) {
  const formatted = formatter.format(value)
  const normalizedCurrency = currency?.toUpperCase()?.trim()
  return normalizedCurrency ? `${normalizedCurrency} ${formatted}` : formatted
}
