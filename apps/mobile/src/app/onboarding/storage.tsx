import { Redirect } from 'expo-router'
import { useEffect } from 'react'

import { refreshMobileOnboarding } from '@/modules/onboarding/onboardingStore'

export default function StorageHandoffReturnRoute() {
  useEffect(() => {
    void refreshMobileOnboarding()
  }, [])

  return <Redirect href="/explore" />
}
