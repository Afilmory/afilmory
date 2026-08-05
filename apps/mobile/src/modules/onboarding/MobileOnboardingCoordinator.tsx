import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { useAuth } from '@/modules/auth/sessionStore'
import { workspaceSetupPage } from '@/modules/auth/workspaceSetupPage'
import { addStoreKitTransactionListener } from '@/native/storeKitBilling'
import { cancelPresentation, present, usePresentationSessions } from '@/presentation'

import { resolveMobileOnboardingPresentation } from './onboardingPresentationPolicy'
import { useMobileOnboardingPresentationRequest } from './onboardingPresentationRequestStore'
import { refreshMobileOnboarding, resetMobileOnboarding, useMobileOnboarding } from './onboardingStore'
import { storageSetupPage } from './storageSetupPage'
import { acknowledgeStoreKitTransaction, reconcileUnfinishedAppStoreTransactions } from './storeKit'

const ONBOARDING_PRESENTATION_DELAY_MS = 400

export function MobileOnboardingCoordinator() {
  const auth = useAuth()
  const onboarding = useMobileOnboarding()
  const presentationRequestVersion = useMobileOnboardingPresentationRequest()
  const presentationSessions = usePresentationSessions()
  const hasActivePresentation = presentationSessions.length > 0
  const [appState, setAppState] = useState(AppState.currentState)
  const presentedKeyRef = useRef<string | null>(null)
  const handledPresentationRequestRef = useRef(presentationRequestVersion)
  const reconciliationKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (auth.status === 'signedIn') {
      void refreshMobileOnboarding()
      return
    }
    presentedKeyRef.current = null
    handledPresentationRequestRef.current = presentationRequestVersion
    reconciliationKeyRef.current = null
    resetMobileOnboarding()
  }, [auth.status, auth.session?.user.id, presentationRequestVersion])

  useEffect(() => {
    if (auth.status !== 'signedIn') {
      return
    }
    const subscription = addStoreKitTransactionListener((transaction) => {
      void acknowledgeStoreKitTransaction(transaction)
        .then(() => refreshMobileOnboarding())
        .catch(() => {})
    })
    return () => subscription.remove()
  }, [auth.status, auth.session?.user.id])

  useEffect(() => {
    if (auth.status !== 'signedIn' || onboarding.status !== 'loaded' || !onboarding.readiness?.workspace) {
      return
    }
    const key = `${auth.session?.user.id}:${onboarding.readiness.workspace.id}`
    if (reconciliationKeyRef.current === key) {
      return
    }
    reconciliationKeyRef.current = key
    void reconcileUnfinishedAppStoreTransactions().then((count) => {
      if (count > 0) {
        void refreshMobileOnboarding()
      }
    })
  }, [auth.session?.user.id, auth.status, onboarding.readiness?.workspace, onboarding.status])

  useEffect(() => {
    setAppState(AppState.currentState)
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state)
      if (state === 'active' && auth.status === 'signedIn') {
        void refreshMobileOnboarding().then(async () => {
          const reconciled = await reconcileUnfinishedAppStoreTransactions()
          if (reconciled > 0) {
            await refreshMobileOnboarding()
          }
        })
      }
    })
    return () => subscription.remove()
  }, [auth.status, auth.session?.user.id])

  useEffect(() => {
    const onboardingSessions = presentationSessions.filter(
      session => session.page.id === workspaceSetupPage.id || session.page.id === storageSetupPage.id,
    )
    if (onboardingSessions.length === 0) {
      return
    }
    const readiness = onboarding.readiness
    const target = readiness ? resolveMobileOnboardingPresentation(readiness.state) : null
    if (auth.status !== 'signedIn' || onboarding.status !== 'loaded' || !target) {
      for (const session of onboardingSessions) {
        cancelPresentation(session.id)
      }
      return
    }
    const desiredPageId = target.page === 'workspace' ? workspaceSetupPage.id : storageSetupPage.id
    for (const session of onboardingSessions) {
      if (session.page.id !== desiredPageId || session.presentation.dismissible !== target.dismissible) {
        cancelPresentation(session.id)
      }
    }
  }, [auth.status, onboarding.readiness, onboarding.status, presentationSessions])

  useEffect(() => {
    const readiness = onboarding.readiness
    const target = readiness ? resolveMobileOnboardingPresentation(readiness.state) : null
    const hasExplicitRequest = presentationRequestVersion !== handledPresentationRequestRef.current
    if (auth.status !== 'signedIn') {
      handledPresentationRequestRef.current = presentationRequestVersion
      return
    }
    if (onboarding.status === 'loaded' && readiness?.state === 'ready') {
      handledPresentationRequestRef.current = presentationRequestVersion
      return
    }
    if (appState !== 'active' || onboarding.status !== 'loaded' || !readiness || !target || hasActivePresentation) {
      return
    }
    const key = `${auth.session?.user.id}:${readiness.workspace?.id ?? 'none'}:${readiness.state}`
    if (!hasExplicitRequest && presentedKeyRef.current === key) {
      return
    }
    const timer = setTimeout(() => {
      if (hasExplicitRequest) {
        handledPresentationRequestRef.current = presentationRequestVersion
      }
      presentedKeyRef.current = key
      const result
        = target.page === 'workspace'
          ? present(workspaceSetupPage, undefined, { dismissible: target.dismissible })
          : present(storageSetupPage, undefined, { dismissible: target.dismissible })
      void result.then((settled) => {
        if (!target.dismissible) {
          presentedKeyRef.current = null
        }
        if (settled.status === 'completed' && settled.value !== 'dismissed') {
          void refreshMobileOnboarding()
        }
      })
    }, ONBOARDING_PRESENTATION_DELAY_MS)
    return () => clearTimeout(timer)
  }, [
    appState,
    auth.session?.user.id,
    auth.status,
    hasActivePresentation,
    onboarding.readiness,
    onboarding.status,
    presentationRequestVersion,
  ])

  return null
}
