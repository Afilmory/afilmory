import type { FC } from 'react'

import { LinearBorderContainer } from '../LinearBorderContainer'

export const ErrorState: FC = () => (
  <div className="flex min-h-screen items-center justify-center px-6">
    <LinearBorderContainer tint="color-mix(in srgb, var(--color-red) 50%, transparent)">
      <div className="bg-fill-secondary/60 w-full max-w-lg p-8 text-center">
        <i className="i-mingcute-alert-fill text-red mb-3 text-3xl" />
        <h1 className="text-text mb-2 text-2xl font-semibold">Unable to connect</h1>
        <p className="text-text-secondary text-sm">
          The dashboard could not reach the core service. Ensure the backend is running and refresh the page.
        </p>
      </div>
    </LinearBorderContainer>
  </div>
)
