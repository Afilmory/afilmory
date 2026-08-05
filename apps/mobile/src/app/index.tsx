import { Redirect } from 'expo-router'

import { useAuth } from '@/modules/auth/sessionStore'
import { isMobileWorkspaceReady, useMobileOnboarding } from '@/modules/onboarding/onboardingStore'
import { getDefaultTabPath } from '@/modules/shell/tabAccess'

export default function IndexRoute() {
  const auth = useAuth()
  const onboarding = useMobileOnboarding()
  const href = getDefaultTabPath(auth.status, isMobileWorkspaceReady(onboarding))

  return href ? <Redirect href={href} /> : null
}
