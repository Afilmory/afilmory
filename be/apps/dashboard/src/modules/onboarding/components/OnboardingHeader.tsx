import type { FC } from 'react'

import type { OnboardingStep } from '../constants'

type OnboardingHeaderProps = {
  currentStepIndex: number
  totalSteps: number
  step: OnboardingStep
}

export const OnboardingHeader: FC<OnboardingHeaderProps> = ({ currentStepIndex, totalSteps, step }) => (
  <header className="p-8 pb-6">
    <div className="bg-accent/10 text-accent inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium">
      Step {currentStepIndex + 1} of {totalSteps}
    </div>
    <h1 className="text-text mt-4 text-3xl font-bold">{step.title}</h1>
    <p className="text-text-secondary mt-2 max-w-2xl text-sm">{step.description}</p>
  </header>
)
