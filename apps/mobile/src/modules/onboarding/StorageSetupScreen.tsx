import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useTranslation } from '@/i18n'
import { accountSettingsPage } from '@/modules/auth/accountSettingsPage'
import { signOut } from '@/modules/auth/sessionStore'
import type { StoreKitProduct } from '@/native/storeKitBilling'
import { loadStoreKitProducts, openStoreKitSubscriptionManagement } from '@/native/storeKitBilling'
import { usePageRuntime } from '@/presentation'
import type { Palette } from '@/theme/palette'
import { controlH, font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { createMobileStorageHandoff } from './api'
import { isMobileOnboardingDismissible } from './onboardingPresentationPolicy'
import { refreshMobileOnboarding, useMobileOnboarding } from './onboardingStore'
import type { StorageSetupResult } from './storageSetupPage'
import { purchaseAppStoreOffer, restoreAppStorePurchases } from './storeKit'
import type { MobileBillingOffer, MobileOnboardingReadiness } from './types'

const LEGAL_ORIGIN = 'https://afilmory.art'
const EMPTY_APP_STORE = { configured: false, offers: [] } satisfies MobileOnboardingReadiness['appStore']
const EMPTY_PERMISSIONS = {
  canConfigureByo: false,
  canPurchase: false,
} satisfies MobileOnboardingReadiness['permissions']

export function StorageSetupScreen() {
  const { finish, present } = usePageRuntime<undefined, StorageSetupResult>()
  const { palette } = useTheme()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(palette), [palette])
  const onboarding = useMobileOnboarding()
  const readiness = onboarding.readiness
  const appStore = readiness?.appStore ?? EMPTY_APP_STORE
  const permissions = readiness?.permissions ?? EMPTY_PERMISSIONS
  const dismissible = readiness ? isMobileOnboardingDismissible(readiness.state) : false
  const offers = useMemo(() => appStore.offers.filter(offer => Boolean(offer.storagePlanId)), [appStore.offers])
  const [products, setProducts] = useState<StoreKitProduct[]>([])
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (readiness?.state === 'ready') {
      finish('completed')
    }
  }, [finish, readiness?.state])

  useEffect(() => {
    let active = true
    if (offers.length === 0) {
      setProducts([])
      return () => {
        active = false
      }
    }
    void loadStoreKitProducts(offers.map(offer => offer.externalProductId))
      .then((nextProducts) => {
        if (active) {
          setProducts(nextProducts)
        }
      })
      .catch(() => {
        if (active) {
          setProducts([])
        }
      })
    return () => {
      active = false
    }
  }, [offers])

  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products])

  const purchase = async (offer: MobileBillingOffer) => {
    setBusyAction(offer.id)
    setError(null)
    setNotice(null)
    try {
      const outcome = await purchaseAppStoreOffer(offer.id)
      if (outcome === 'cancelled') {
        return
      }
      if (outcome === 'pending') {
        setNotice(t('onboarding.storage.purchasePending'))
        await refreshMobileOnboarding()
        return
      }
      const next = await refreshMobileOnboarding()
      if (next?.state === 'ready') {
        finish('completed')
      }
    }
    catch {
      setError(t('onboarding.storage.purchaseFailed'))
    }
    finally {
      setBusyAction(null)
    }
  }

  const restore = async () => {
    setBusyAction('restore')
    setError(null)
    setNotice(null)
    try {
      const restored = await restoreAppStorePurchases(offers.map(offer => offer.externalProductId))
      const next = await refreshMobileOnboarding()
      if (next?.state === 'ready') {
        finish('completed')
        return
      }
      setNotice(t(restored > 0 ? 'onboarding.storage.restoreSynced' : 'onboarding.storage.restoreEmpty'))
    }
    catch {
      setError(t('onboarding.storage.restoreFailed'))
    }
    finally {
      setBusyAction(null)
    }
  }

  const openByoSetup = async () => {
    setBusyAction('byo')
    setError(null)
    try {
      const handoff = await createMobileStorageHandoff()
      await Linking.openURL(handoff.setupUrl)
      finish('handoff-opened')
    }
    catch {
      setError(t('onboarding.storage.byoFailed'))
    }
    finally {
      setBusyAction(null)
    }
  }

  if (!readiness) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} />
        <Text style={styles.description}>{t('onboarding.storage.loading')}</Text>
      </View>
    )
  }

  const isOwnerActionRequired = readiness.state === 'owner_action_required'
  const hasAppStoreSubscription = readiness.subscription?.provider === 'app_store'
  const appStoreAvailable = appStore.configured && permissions.canPurchase

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title}>
          {t(isOwnerActionRequired ? 'onboarding.storage.ownerActionTitle' : 'onboarding.storage.title')}
        </Text>
        <Text style={styles.description}>
          {t(isOwnerActionRequired ? 'onboarding.storage.ownerActionDescription' : 'onboarding.storage.description')}
        </Text>
      </View>

      {readiness.state === 'purchase_pending' ? (
        <View style={styles.noticeCard}>
          <Text style={styles.cardTitle}>{t('onboarding.storage.pendingTitle')}</Text>
          <Text style={styles.description}>{t('onboarding.storage.purchasePending')}</Text>
        </View>
      ) : null}

      {permissions.canPurchase ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('onboarding.storage.managedTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('onboarding.storage.managedDescription')}</Text>
          {offers.map((offer) => {
            const product = productsById.get(offer.externalProductId)
            const disabled = busyAction !== null || !appStoreAvailable || !product
            return (
              <View key={offer.id} style={styles.offerCard}>
                <View style={styles.offerCopy}>
                  <Text style={styles.cardTitle}>{offer.name}</Text>
                  <Text style={styles.offerDetail}>
                    {offer.storageCapacityBytes
                      ? t('onboarding.storage.capacity', { capacity: formatCapacity(offer.storageCapacityBytes) })
                      : offer.description}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.purchaseButton,
                    disabled && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void purchase(offer)}
                >
                  {busyAction === offer.id ? (
                    <ActivityIndicator color={palette.accentContrast} />
                  ) : (
                    <Text style={styles.purchaseLabel}>
                      {product ? formatProductPrice(product, t) : t('onboarding.storage.unavailable')}
                    </Text>
                  )}
                </Pressable>
              </View>
            )
          })}
          {!appStore.configured ? (
            <Text style={styles.footnote}>{t('onboarding.storage.storeUnavailable')}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busyAction !== null || offers.length === 0 || !appStore.configured}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            onPress={() => void restore()}
          >
            {busyAction === 'restore' ? (
              <ActivityIndicator color={palette.accent} />
            ) : (
              <Text style={styles.textButtonLabel}>{t('onboarding.storage.restore')}</Text>
            )}
          </Pressable>
          {hasAppStoreSubscription ? (
            <Pressable
              accessibilityRole="button"
              disabled={busyAction !== null}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              onPress={() => void openStoreKitSubscriptionManagement()}
            >
              <Text style={styles.textButtonLabel}>{t('onboarding.storage.manageSubscription')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {permissions.canConfigureByo ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('onboarding.storage.byoTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('onboarding.storage.byoDescription')}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busyAction !== null}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={() => void openByoSetup()}
          >
            {busyAction === 'byo' ? (
              <ActivityIndicator color={palette.textPrimary} />
            ) : (
              <Text style={styles.secondaryLabel}>{t('onboarding.storage.byoAction')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.legalRow}>
        <Pressable onPress={() => void Linking.openURL(`${LEGAL_ORIGIN}/terms`)}>
          <Text style={styles.legalLink}>{t('onboarding.legal.terms')}</Text>
        </Pressable>
        <Text style={styles.legalSeparator}>·</Text>
        <Pressable onPress={() => void Linking.openURL(`${LEGAL_ORIGIN}/privacy`)}>
          <Text style={styles.legalLink}>{t('onboarding.legal.privacy')}</Text>
        </Pressable>
      </View>

      <View style={styles.footerActions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          onPress={() => void present(accountSettingsPage, { fromOnboarding: true })}
        >
          <Text style={styles.textButtonLabel}>{t('account.settings.title')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busyAction !== null}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          onPress={() => void signOut().then(() => finish('signed-out'))}
        >
          <Text style={styles.textButtonLabel}>{t('common.signOut')}</Text>
        </Pressable>
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            onPress={() => finish('dismissed')}
          >
            <Text style={styles.textButtonLabel}>{t('onboarding.storage.continueExplore')}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  )
}

function formatCapacity(bytes: number): string {
  const gibibytes = bytes / 1024 ** 3
  return gibibytes >= 1024 ? `${gibibytes / 1024} TB` : `${gibibytes} GB`
}

function formatProductPrice(product: StoreKitProduct, t: (key: string, options?: Record<string, unknown>) => string) {
  const period = product.subscriptionPeriod
  if (!period) {
    return product.displayPrice
  }
  const periodLabel = t(`onboarding.storage.period.${period.unit}`, { count: period.value })
  return t('onboarding.storage.price', { period: periodLabel, price: product.displayPrice })
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    centered: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
    content: { gap: 22, padding: 20, paddingBottom: 48 },
    intro: { gap: 8 },
    title: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 24, fontWeight: '700' },
    description: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
    noticeCard: {
      backgroundColor: palette.accentDim,
      borderColor: palette.accentLine,
      borderCurve: 'continuous',
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 5,
      padding: 16,
    },
    section: { gap: 10 },
    sectionTitle: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 16, fontWeight: '700' },
    sectionDescription: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
    offerCard: {
      alignItems: 'center',
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: 16,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    offerCopy: { flex: 1, gap: 4 },
    cardTitle: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 15, fontWeight: '700' },
    offerDetail: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
    purchaseButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      justifyContent: 'center',
      minHeight: 38,
      minWidth: 96,
      paddingHorizontal: 14,
    },
    purchaseLabel: { color: palette.accentContrast, fontFamily: font.ui, fontSize: 13, fontWeight: '700' },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      height: controlH,
      justifyContent: 'center',
    },
    secondaryLabel: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 15, fontWeight: '700' },
    textButton: { alignItems: 'center', minHeight: 38, justifyContent: 'center' },
    textButtonLabel: { color: palette.accentHi, fontFamily: font.ui, fontSize: 14, fontWeight: '600' },
    footnote: { color: palette.textMuted, fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
    noticeText: { color: palette.accentHi, fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
    error: { color: palette.danger, fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
    legalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    legalLink: { color: palette.textMuted, fontFamily: font.ui, fontSize: 12, textDecorationLine: 'underline' },
    legalSeparator: { color: palette.textMuted, marginHorizontal: 8 },
    footerActions: { gap: 2 },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.65 },
  })
}
