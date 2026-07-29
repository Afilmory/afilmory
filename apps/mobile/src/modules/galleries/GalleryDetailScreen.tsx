import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { usePageRuntime } from '@/presentation'
import type { Palette } from '@/theme/palette'
import { useTheme } from '@/theme/useTheme'

import { GalleryMasonry } from './GalleryMasonry'
import type { FeaturedGallery } from './types'

export function GalleryDetailScreen() {
  const { params: gallery } = usePageRuntime<FeaturedGallery>()
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: gallery.name }} />
      <GalleryMasonry slug={gallery.slug} />
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bgCanvas },
  })
}
