import type { FC } from 'react'

import { REGISTRATION_STEPS } from './constants'

type HeaderProps = {
  currentStepIndex: number
}

export const RegistrationHeader: FC<HeaderProps> = ({ currentStepIndex }) => {
  const step = REGISTRATION_STEPS[currentStepIndex]
  return (
    <header className="p-8 pb-6">
      <div className="bg-accent/10 text-accent inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium">
        Step {currentStepIndex + 1} of {REGISTRATION_STEPS.length}
      </div>
      <h1 className="text-text mt-4 text-3xl font-bold">{step.title}</h1>
      <p className="text-text-secondary mt-2 max-w-2xl text-sm">{step.description}</p>
    </header>
  )
}
