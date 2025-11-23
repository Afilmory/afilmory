import { Button } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import type { SessionResponse } from '~/modules/auth/api/session'
import { AUTH_SESSION_QUERY_KEY } from '~/modules/auth/api/session'
import { authClient } from '~/modules/auth/auth-client'
import type { BillingPlanSummary } from '~/modules/billing'
import { useTenantPlanQuery } from '~/modules/billing'
import { buildCheckoutSuccessUrl } from '~/modules/billing/creem-utils'

const planI18nKeys = {
  pageTitle: 'plan.page.title',
  pageDescription: 'plan.page.description',
  errorLoadPrefix: 'plan.error.load-prefix',
  errorUnknown: 'plan.error.unknown',
  toastCheckoutUnavailable: 'plan.toast.checkout-unavailable',
  toastMissingCheckoutUrl: 'plan.toast.missing-checkout-url',
  toastCheckoutFailure: 'plan.toast.checkout-failure',
  toastMissingPortalAccount: 'plan.toast.missing-portal-account',
  toastMissingPortalUrl: 'plan.toast.missing-portal-url',
  toastPortalFailure: 'plan.toast.portal-failure',
  badgeInternal: 'plan.badge.internal',
  badgeCurrent: 'plan.badge.current',
  quotaUnlimited: 'plan.quotas.unlimited',
  checkoutLoading: 'plan.checkout.loading',
  checkoutUpgrade: 'plan.checkout.upgrade',
  checkoutComingSoon: 'plan.checkout.coming-soon',
  portalLoading: 'plan.portal.loading',
  portalManage: 'plan.portal.manage',
} as const satisfies Record<
  | 'pageTitle'
  | 'pageDescription'
  | 'errorLoadPrefix'
  | 'errorUnknown'
  | 'toastCheckoutUnavailable'
  | 'toastMissingCheckoutUrl'
  | 'toastCheckoutFailure'
  | 'toastMissingPortalAccount'
  | 'toastMissingPortalUrl'
  | 'toastPortalFailure'
  | 'badgeInternal'
  | 'badgeCurrent'
  | 'quotaUnlimited'
  | 'checkoutLoading'
  | 'checkoutUpgrade'
  | 'checkoutComingSoon'
  | 'portalLoading'
  | 'portalManage',
  I18nKeys
>

const planI18nPrefixes = {
  quotaLabelPrefix: 'plan.quotas.label.',
  quotaUnitPrefix: 'plan.quotas.unit.',
} as const

const QUOTA_LABEL_KEYS: Record<string, I18nKeys> = {
  monthlyAssetProcessLimit: `${planI18nPrefixes.quotaLabelPrefix}monthlyAssetProcessLimit`,
  libraryItemLimit: `${planI18nPrefixes.quotaLabelPrefix}libraryItemLimit`,
  maxUploadSizeMb: `${planI18nPrefixes.quotaLabelPrefix}maxUploadSizeMb`,
  maxSyncObjectSizeMb: `${planI18nPrefixes.quotaLabelPrefix}maxSyncObjectSizeMb`,
}

const QUOTA_UNIT_KEYS: Record<string, I18nKeys | null> = {
  monthlyAssetProcessLimit: `${planI18nPrefixes.quotaUnitPrefix}photos`,
  libraryItemLimit: `${planI18nPrefixes.quotaUnitPrefix}photos`,
  maxUploadSizeMb: `${planI18nPrefixes.quotaUnitPrefix}megabytes`,
  maxSyncObjectSizeMb: `${planI18nPrefixes.quotaUnitPrefix}megabytes`,
}

export function Component() {
  const { t } = useTranslation()
  const planQuery = useTenantPlanQuery()
  const queryClient = useQueryClient()
  const session = (queryClient.getQueryData<SessionResponse | null>(AUTH_SESSION_QUERY_KEY) ??
    null) as SessionResponse | null

  const tenantId = session?.tenant?.id ?? null
  const tenantSlug = session?.tenant?.slug ?? null
  const creemCustomerId = session?.user?.creemCustomerId ?? null

  const plan = planQuery.data?.plan ?? null
  const availablePlans = planQuery.data?.availablePlans ?? []
  const plans = useMemo(() => {
    if (!plan) {
      return []
    }
    const merged = new Map<string, BillingPlanSummary>()
    for (const candidate of [plan, ...availablePlans]) {
      if (candidate && !merged.has(candidate.planId)) {
        merged.set(candidate.planId, candidate)
      }
    }
    return Array.from(merged.values())
  }, [availablePlans, plan])

  return (
    <MainPageLayout title={t(planI18nKeys.pageTitle)} description={t(planI18nKeys.pageDescription)}>
      <div className="space-y-6">
        {planQuery.isError && (
          <div className="text-red text-sm">
            {t(planI18nKeys.errorLoadPrefix)}{' '}
            {planQuery.error instanceof Error ? planQuery.error.message : t(planI18nKeys.errorUnknown)}
          </div>
        )}

        {planQuery.isLoading || !plan ? (
          <PlanSkeleton />
        ) : (
          <PlanList
            currentPlanId={plan.planId}
            plans={plans}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            creemCustomerId={creemCustomerId}
          />
        )}
      </div>
    </MainPageLayout>
  )
}

function PlanList({
  currentPlanId,
  plans,
  tenantId,
  tenantSlug,
  creemCustomerId,
}: {
  currentPlanId: string
  plans: BillingPlanSummary[]
  tenantId: string | null
  tenantSlug: string | null
  creemCustomerId: string | null
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((plan) => (
        <PlanCard
          key={plan.planId}
          plan={plan}
          isCurrent={plan.planId === currentPlanId}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          creemCustomerId={creemCustomerId}
        />
      ))}
    </div>
  )
}

function PlanCard({
  plan,
  isCurrent,
  tenantId,
  tenantSlug,
  creemCustomerId,
}: {
  plan: BillingPlanSummary
  isCurrent: boolean
  tenantId: string | null
  tenantSlug: string | null
  creemCustomerId: string | null
}) {
  const { t, i18n } = useTranslation()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const productId = plan.payment?.creemProductId ?? null
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const quotaNumberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])

  const canCheckout = Boolean(!isCurrent && tenantId && productId)

  const showPortalButton = isCurrent && plan.planId !== 'free' && Boolean(productId && creemCustomerId)
  const formatQuotaValue = (value: number | null, unitKey: I18nKeys | null) => {
    if (value === null || value === undefined) {
      return t(planI18nKeys.quotaUnlimited)
    }
    const numeral = quotaNumberFormatter.format(value)
    return unitKey ? t(unitKey, { value: numeral }) : numeral
  }

  const handleCheckout = async () => {
    if (!canCheckout || !tenantId || !productId) {
      toast.error(t(planI18nKeys.toastCheckoutUnavailable))
      return
    }
    setCheckoutLoading(true)
    const successUrl = buildCheckoutSuccessUrl(tenantSlug)
    const metadata: Record<string, string> = {
      tenantId,
      planId: plan.planId,
    }
    if (tenantSlug) {
      metadata.tenantSlug = tenantSlug
    }
    try {
      const { data, error } = await authClient.creem.createCheckout({
        productId,
        successUrl,
        metadata,
      })
      if (error) {
        throw new Error(error.message ?? t(planI18nKeys.toastCheckoutFailure))
      }
      if (data?.url) {
        window.location.href = data.url
        return
      }
      toast.error(t(planI18nKeys.toastMissingCheckoutUrl))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(planI18nKeys.toastCheckoutFailure))
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handlePortal = async () => {
    if (!showPortalButton || !creemCustomerId) {
      toast.error(t(planI18nKeys.toastMissingPortalAccount))
      return
    }
    setPortalLoading(true)
    try {
      const portalPayload = creemCustomerId ? { customerId: creemCustomerId } : undefined
      const { data, error } = await authClient.creem.createPortal(portalPayload)
      if (error) {
        throw new Error(error.message ?? t(planI18nKeys.toastPortalFailure))
      }
      if (data?.url) {
        window.location.href = data.url
        return
      }
      toast.error(t(planI18nKeys.toastMissingPortalUrl))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(planI18nKeys.toastPortalFailure))
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <LinearBorderPanel className="bg-background-secondary/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{plan.name}</h2>
          <p className="text-text-secondary text-sm">{plan.description}</p>
          {plan.pricing && plan.pricing.monthlyPrice !== null && plan.pricing.monthlyPrice !== undefined && (
            <p
              className={clsxm(
                'text-text absolute right-0 top-0 mt-1 text-sm font-semibold',
                isCurrent && 'translate-y-6',
              )}
            >
              {formatPrice(plan.pricing.monthlyPrice, plan.pricing.currency, locale)}
            </p>
          )}
        </div>
        {isCurrent && <CurrentBadge planId={plan.planId} />}
      </div>

      <ul className="mt-6 space-y-2">
        {Object.entries(plan.quotas).map(([key, value]) => (
          <li key={key} className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">{t(QUOTA_LABEL_KEYS[key] ?? key)}</span>
            <span className="text-text font-medium">{formatQuotaValue(value, QUOTA_UNIT_KEYS[key] ?? null)}</span>
          </li>
        ))}
      </ul>

      {!isCurrent && (
        <Button
          type="button"
          className="mt-4 w-full"
          size="sm"
          disabled={!canCheckout || checkoutLoading}
          onClick={handleCheckout}
        >
          {checkoutLoading
            ? t(planI18nKeys.checkoutLoading)
            : canCheckout
              ? t(planI18nKeys.checkoutUpgrade)
              : t(planI18nKeys.checkoutComingSoon)}
        </Button>
      )}

      {showPortalButton && (
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full"
          size="sm"
          disabled={portalLoading}
          onClick={handlePortal}
        >
          {portalLoading ? t(planI18nKeys.portalLoading) : t(planI18nKeys.portalManage)}
        </Button>
      )}
    </LinearBorderPanel>
  )
}

function CurrentBadge({ planId }: { planId: string }) {
  const { t } = useTranslation()
  const labelKey = planId === 'friend' ? planI18nKeys.badgeInternal : planI18nKeys.badgeCurrent
  return <span className="bg-accent/10 text-accent rounded-full px-2 py-0.5 text-xs font-semibold">{t(labelKey)}</span>
}

function formatPrice(value: number, currency: string | null | undefined, locale: string): string {
  const normalizedCurrency = currency?.toUpperCase() ?? ''
  const formatted = value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return normalizedCurrency ? `${normalizedCurrency} ${formatted}` : formatted
}

function PlanSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={`plan-skeleton-${index}`}
          className="rounded-2xl border border-border/30 bg-background-secondary/40 p-5"
        >
          <div className="bg-fill/50 h-6 w-1/2 animate-pulse rounded" />
          <div className="bg-fill/30 mt-2 h-4 w-2/3 animate-pulse rounded" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }).map((__, quotaIndex) => (
              <div key={`quota-${quotaIndex}`} className="bg-fill/20 h-4 animate-pulse rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
