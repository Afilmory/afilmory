import { ScrollArea } from '@afilmory/ui'
import type { FC, ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'

import { ONBOARDING_STEPS } from '../constants'
import { useOnboardingWizard } from '../hooks/useOnboardingWizard'
import { LinearBorderContainer } from './LinearBorderContainer'
import { OnboardingFooter } from './OnboardingFooter'
import { OnboardingHeader } from './OnboardingHeader'
import { OnboardingSidebar } from './OnboardingSidebar'
import { ErrorState } from './states/ErrorState'
import { InitializedState } from './states/InitializedState'
import { LoadingState } from './states/LoadingState'
import { AdminStep } from './steps/AdminStep'
import { ReviewStep } from './steps/ReviewStep'
import { SettingsStep } from './steps/SettingsStep'
import { SiteStep } from './steps/SiteStep'
import { TenantStep } from './steps/TenantStep'
import { WelcomeStep } from './steps/WelcomeStep'

export const OnboardingWizard: FC = () => {
  const wizard = useOnboardingWizard()
  const {
    query,
    mutation,
    currentStepIndex,
    currentStep,
    goToNext,
    goToPrevious,
    jumpToStep,
    canNavigateTo,
    tenant,
    admin,
    site,
    settingsState,
    acknowledged,
    setAcknowledged,
    errors,
    updateTenantName,
    updateTenantSlug,
    updateAdminField,
    toggleSetting,
    updateSettingValue,
    updateSiteField,
    reviewSettings,
    siteSchema,
    siteSchemaLoading,
    siteSchemaError,
  } = wizard

  // Autofocus management: focus first focusable control when step changes
  const contentRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const rafId = requestAnimationFrame(() => {
      const selector = [
        'input:not([type="hidden"]):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',')

      const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector))
      const firstVisible = candidates.find((el) => {
        // Skip elements that are aria-hidden or not rendered
        if (el.getAttribute('aria-hidden') === 'true') return false
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        // Skip disabled switches/buttons
        if ((el as HTMLInputElement).disabled) return false
        return true
      })

      firstVisible?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(rafId)
  }, [currentStepIndex, currentStep.id])

  // Enter-to-next: advance when pressing Enter on inputs (not textarea or composing)
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter') return
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      // Avoid while IME composing
      const nativeEvent = event.nativeEvent as unknown as {
        isComposing?: boolean
      }
      if (nativeEvent?.isComposing) return

      const target = event.target as HTMLElement
      if (target.isContentEditable) return
      if (target.tagName === 'TEXTAREA') return

      // Let buttons/links behave naturally
      if (target.tagName === 'BUTTON' || target.tagName === 'A') return

      // Avoid toggles like checkbox/radio
      if (target.tagName === 'INPUT') {
        const { type } = target as HTMLInputElement
        if (type === 'checkbox' || type === 'radio') return
      }

      event.preventDefault()
      goToNext()
    },
    [goToNext],
  )

  if (query.isLoading) {
    return <LoadingState />
  }

  if (query.isError) {
    return <ErrorState />
  }

  if (query.data?.initialized) {
    return <InitializedState />
  }

  if (siteSchemaLoading || !siteSchema) {
    return <LoadingState />
  }

  if (siteSchemaError) {
    return <ErrorState />
  }

  const stepContent: Record<typeof currentStep.id, ReactNode> = {
    welcome: <WelcomeStep />,
    tenant: (
      <TenantStep tenant={tenant} errors={errors} onNameChange={updateTenantName} onSlugChange={updateTenantSlug} />
    ),
    admin: <AdminStep admin={admin} errors={errors} onChange={updateAdminField} />,
    site: <SiteStep schema={siteSchema} values={site} errors={errors} onFieldChange={updateSiteField} />,
    settings: (
      <SettingsStep
        settingsState={settingsState}
        errors={errors}
        onToggle={toggleSetting}
        onChange={updateSettingValue}
      />
    ),
    review: (
      <ReviewStep
        tenant={tenant}
        admin={admin}
        site={site}
        siteSchema={siteSchema}
        siteSchemaLoading={false}
        siteSchemaError={null}
        reviewSettings={reviewSettings}
        acknowledged={acknowledged}
        errors={errors}
        onAcknowledgeChange={setAcknowledged}
      />
    ),
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      <LinearBorderContainer className="bg-background-tertiary h-[85vh] w-full max-w-7xl">
        <div className="grid h-full lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <div className="relative h-full">
            {/* Vertical divider with gradient that fades at top/bottom */}
            <div className="via-text/20 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
            <OnboardingSidebar
              currentStepIndex={currentStepIndex}
              canNavigateTo={canNavigateTo}
              onStepSelect={jumpToStep}
            />
          </div>

          {/* Main content with fixed height and scrollable area */}
          <main className="flex h-full w-[800px] flex-col">
            {/* Fixed header */}
            <div className="shrink-0">
              <OnboardingHeader
                currentStepIndex={currentStepIndex}
                totalSteps={ONBOARDING_STEPS.length}
                step={currentStep}
              />
              {/* Horizontal divider */}
              <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
            </div>

            {/* Scrollable content area */}
            <div className="relative flex h-0 flex-1">
              <ScrollArea rootClassName="absolute! inset-0 h-full w-full">
                <section ref={contentRef} className="p-12" onKeyDown={handleKeyDown}>
                  {stepContent[currentStep.id]}
                </section>
              </ScrollArea>
            </div>

            {/* Fixed footer */}
            <div className="shrink-0">
              {/* Horizontal divider */}
              <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
              <OnboardingFooter
                onBack={goToPrevious}
                onNext={goToNext}
                disableBack={currentStepIndex === 0}
                isSubmitting={mutation.isPending}
                isLastStep={currentStepIndex === ONBOARDING_STEPS.length - 1}
              />
            </div>
          </main>
        </div>
      </LinearBorderContainer>
    </div>
  )
}
