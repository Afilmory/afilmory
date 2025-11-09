import type { FC } from 'react'

import { LinearBorderContainer } from '../LinearBorderContainer'

export const LoadingState: FC = () => (
  <div className="flex min-h-screen items-center justify-center px-6">
    <LinearBorderContainer tint="color-mix(in srgb, var(--color-accent) 50%, transparent)">
      <div className="bg-fill-secondary/60 w-full max-w-lg p-8 text-center">
        <i className="i-mingcute-loading-3-fill text-accent animate-spin" />
        <h1 className="text-text mb-2 text-2xl font-semibold">Preparing onboarding experience</h1>
        <p className="text-text-secondary text-sm">
          The dashboard is preparing the onboarding experience. Please wait a moment.
        </p>
      </div>
    </LinearBorderContainer>
  </div>
)
