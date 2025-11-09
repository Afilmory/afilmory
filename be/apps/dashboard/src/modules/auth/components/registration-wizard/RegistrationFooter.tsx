import { Button } from '@afilmory/ui'
import type { FC } from 'react'

type FooterProps = {
  disableBack: boolean
  isSubmitting: boolean
  isLastStep: boolean
  onBack: () => void
  onNext: () => void
}

export const RegistrationFooter: FC<FooterProps> = ({ disableBack, isSubmitting, isLastStep, onBack, onNext }) => (
  <footer className="flex flex-col gap-3 p-8 pt-6 sm:flex-row sm:items-center sm:justify-between">
    <div />
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
      <Button type="button" variant="primary" size="md" className="min-w-40" onClick={onNext} isLoading={isSubmitting}>
        {isLastStep ? 'Create workspace' : 'Continue'}
      </Button>
    </div>
  </footer>
)
