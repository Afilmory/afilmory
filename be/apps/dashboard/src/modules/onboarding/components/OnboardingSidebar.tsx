import { cx } from '@afilmory/utils'
import type { FC } from 'react'

import { ONBOARDING_STEPS } from '../constants'
import { stepProgress } from '../utils'

type OnboardingSidebarProps = {
  currentStepIndex: number
  canNavigateTo: (index: number) => boolean
  onStepSelect: (index: number) => void
}

export const OnboardingSidebar: FC<OnboardingSidebarProps> = ({ currentStepIndex, canNavigateTo, onStepSelect }) => (
  <aside className="hidden min-h-full flex-col gap-6 p-6 lg:flex">
    <div>
      <p className="text-accent text-xs font-medium">Setup Journey</p>
      <h2 className="text-text mt-2 text-base font-semibold">Launch your photo platform</h2>
    </div>

    {/* Timeline container */}
    <div className="relative flex-1">
      {ONBOARDING_STEPS.map((step, index) => {
        const status: 'done' | 'current' | 'pending' =
          index < currentStepIndex ? 'done' : index === currentStepIndex ? 'current' : 'pending'

        const isLast = index === ONBOARDING_STEPS.length - 1
        const isClickable = canNavigateTo(index)

        return (
          <div key={step.id} className="relative flex gap-3">
            {/* Vertical line - only show if not last item */}
            {!isLast && (
              <div className="absolute top-7 bottom-0 left-[13px] w-[1.5px]">
                {/* Completed segment */}
                {status === 'done' && <div className="bg-accent h-full w-full" />}
                {/* Current segment - gradient transition */}
                {status === 'current' && (
                  <div
                    className="h-full w-full"
                    style={{
                      background:
                        'linear-gradient(to bottom, var(--color-accent) 0%, var(--color-accent) 30%, color-mix(in srgb, var(--color-text) 15%, transparent) 100%)',
                    }}
                  />
                )}
                {/* Pending segment */}
                {status === 'pending' && <div className="bg-text/15 h-full w-full" />}
              </div>
            )}

            {/* Step node and content */}
            <button
              type="button"
              className={cx(
                'relative flex w-full items-start gap-3 pb-6 text-left transition-all duration-200',
                isClickable ? 'cursor-pointer' : 'cursor-default',
                !isClickable && 'opacity-60',
              )}
              onClick={() => {
                if (isClickable) {
                  onStepSelect(index)
                }
              }}
              disabled={!isClickable}
            >
              {/* Circle node */}
              <div className="relative z-10 shrink-0 pt-0.5">
                <div
                  className={cx(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200',
                    // Done state
                    status === 'done' && 'bg-accent text-white ring-4 ring-accent/10',
                    // Current state with subtle glow
                    status === 'current' && 'bg-accent text-white ring-4 ring-accent/25',
                    // Pending state
                    status === 'pending' && 'border-[1.5px] border-text/20 bg-background text-text-tertiary',
                  )}
                >
                  {status === 'done' ? <i className="i-mingcute-check-fill text-sm" /> : <span>{index + 1}</span>}
                </div>
              </div>

              {/* Step content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cx(
                    'text-sm font-medium transition-colors duration-200',
                    status === 'done' && 'text-text',
                    status === 'current' && 'text-accent',
                    status === 'pending' && 'text-text-tertiary',
                    isClickable && status !== 'current' && 'group-hover:text-text',
                  )}
                >
                  {step.title}
                </p>
                <p
                  className={cx(
                    'mt-0.5 text-xs transition-colors duration-200',
                    status === 'done' && 'text-text-secondary',
                    status === 'current' && 'text-text-secondary',
                    status === 'pending' && 'text-text-tertiary',
                  )}
                >
                  {step.description}
                </p>
              </div>
            </button>
          </div>
        )
      })}
    </div>

    {/* Progress footer */}
    <div className="pt-4">
      {/* Horizontal divider */}
      <div className="via-text/20 mb-4 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />

      <div className="text-text-tertiary mb-2 flex items-center justify-between text-xs">
        <span>Overall Progress</span>
        <span className="text-accent font-medium">{stepProgress(currentStepIndex)}%</span>
      </div>
      <div className="bg-fill-tertiary relative h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-accent absolute top-0 left-0 h-full transition-all duration-500 ease-out"
          style={{ width: `${stepProgress(currentStepIndex)}%` }}
        />
      </div>
    </div>
  </aside>
)
