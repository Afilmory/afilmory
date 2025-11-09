import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'

import { LinearBorderContainer } from '~/modules/onboarding/components/LinearBorderContainer'

function getCurrentHostname() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.location.hostname
  } catch {
    return null
  }
}

export function Component() {
  const navigate = useNavigate()
  const hostname = useMemo(() => getCurrentHostname(), [])

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <div className="bg-background flex flex-1 items-center justify-center">
        <LinearBorderContainer>
          <div className="bg-background-tertiary relative w-[600px]">
            <div className="p-12">
              <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={Spring.presets.smooth}>
                <h1 className="text-text mb-4 text-3xl font-bold">Workspace unavailable</h1>
                <p className="text-text-secondary mb-6 text-base leading-relaxed">
                  We couldn&apos;t find an active workspace for this address. The workspace may have been removed, or
                  the link might be incorrect. If you&apos;re trying to access your organization&apos;s dashboard, check
                  the workspace URL you were given or contact an administrator.
                </p>
                {hostname && (
                  <div className="bg-material-medium border-fill-tertiary mb-6 rounded-lg border px-4 py-3">
                    <p className="text-text-secondary text-sm">
                      Requested host: <span className="text-text font-medium">{hostname}</span>
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="primary" className="flex-1" onClick={() => navigate('/register', { replace: true })}>
                    Create a workspace
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => navigate('/login', { replace: true })}>
                    Go to login
                  </Button>
                </div>
              </m.div>
            </div>
          </div>
        </LinearBorderContainer>
      </div>
    </div>
  )
}
