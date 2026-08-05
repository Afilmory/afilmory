import { useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { OnboardingResumeBanner } from '@/modules/onboarding/OnboardingResumeBanner'
import { NativePageView } from '@/native/NativePageView'

export default function ExplorePage() {
  const params = useLocalSearchParams<{
    event?: string | string[]
    gallery?: string | string[]
    name?: string | string[]
  }>()
  const eventId = firstValue(params.event)
  const gallerySlug = firstValue(params.gallery)
  const galleryName = firstValue(params.name)
  const galleryRoute = useMemo(() => {
    if (!gallerySlug) {
      return undefined
    }
    return JSON.stringify({
      requestId: eventId ?? `route:${gallerySlug}`,
      slug: gallerySlug,
      title: galleryName ?? gallerySlug,
    })
  }, [eventId, galleryName, gallerySlug])

  return (
    <View style={styles.root}>
      <NativePageView galleryRoute={galleryRoute} page="explore" />
      <OnboardingResumeBanner />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
