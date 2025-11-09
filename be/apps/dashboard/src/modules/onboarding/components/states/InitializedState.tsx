import type { FC } from 'react'

import { LinearBorderContainer } from '../LinearBorderContainer'

export const InitializedState: FC = () => (
  <div className="flex min-h-screen items-center justify-center px-6">
    <LinearBorderContainer tint="color-mix(in srgb, var(--color-yellow) 50%, transparent)">
      <div className="bg-fill-secondary/60 w-full max-w-lg p-8 text-center">
        <i className="i-mingcute-shield-user-fill text-accent mt-0.5" />
        <h1 className="text-text mb-2 text-2xl font-semibold">Afilmory Control Center is ready</h1>
        <p className="text-text-secondary text-sm">
          Your workspace has already been provisioned. Sign in with an existing administrator account or invite new
          members from the dashboard.
        </p>
      </div>
    </LinearBorderContainer>
  </div>
)
