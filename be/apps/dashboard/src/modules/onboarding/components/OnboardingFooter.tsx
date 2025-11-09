import { Button } from '@afilmory/ui'
import type { FC } from 'react'

type OnboardingFooterProps = {
  onBack: () => void
  onNext: () => void
  disableBack: boolean
  isSubmitting: boolean
  isLastStep: boolean
}

export const OnboardingFooter: FC<OnboardingFooterProps> = ({
  onBack,
  onNext,
  disableBack,
  isSubmitting,
  isLastStep,
}) => (
  <footer className="flex flex-col gap-3 p-8 pt-6 sm:flex-row sm:items-center sm:justify-between">
    {!disableBack ? (
      <div className="text-text-tertiary text-xs">
        Need to revisit an earlier step? Use the sidebar or go back to adjust your inputs.
      </div>
    ) : (
      <div />
    )}
    <div className="flex gap-2">
      {!disableBack && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="text-text-secondary hover:text-text hover:bg-fill/50 min-w-[140px]"
          onClick={onBack}
          disabled={isSubmitting}
        >
          Back
        </Button>
      )}
      <Button
        type="button"
        variant="primary"
        size="md"
        className="min-w-[140px]"
        onClick={onNext}
        isLoading={isSubmitting}
      >
        {isLastStep ? 'Initialize' : 'Continue'}
      </Button>
    </div>
  </footer>
)
