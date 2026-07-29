import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'

import type { Palette } from '@/theme/palette'
import { font } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { GalleryCard } from './GalleryCard'
import type { FeaturedGallery } from './types'
import { useFeaturedGalleries } from './useFeaturedGalleries'

export function GalleriesScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])
  const { error, galleries, loading, refresh, refreshing, retry } = useFeaturedGalleries()
  const router = useRouter()
  const openGallery = useCallback(
    (gallery: FeaturedGallery) => {
      router.push({
        pathname: '/explore/[slug]',
        params: { slug: gallery.slug, gallery: JSON.stringify(gallery) },
      })
    },
    [router],
  )

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.textSecondary} />
        </View>
      ) : error && galleries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Failed to load galleries</Text>
          <Text numberOfLines={2} style={styles.errorDetail}>
            {error.message}
          </Text>
          <Pressable
            accessibilityLabel="Retry loading galleries"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={retry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          data={galleries}
          keyExtractor={(item: FeaturedGallery) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={palette.textSecondary} onRefresh={refresh} />
          }
          renderItem={({ item }: { item: FeaturedGallery }) => (
            <View style={styles.cardWrapper}>
              <GalleryCard gallery={item} onPress={openGallery} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bgCanvas },
    center: {
      alignItems: 'center',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    listContent: {
      paddingBottom: 120,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    cardWrapper: { paddingBottom: 14 },
    errorTitle: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 16,
      fontWeight: '600',
    },
    errorDetail: {
      color: palette.textSecondary,
      fontFamily: font.ui,
      fontSize: 13,
      textAlign: 'center',
    },
    retryButton: {
      backgroundColor: palette.accentDim,
      borderCurve: 'continuous',
      borderRadius: 10,
      marginTop: 8,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    retryText: {
      color: palette.accent,
      fontFamily: font.ui,
      fontSize: 14,
      fontWeight: '600',
    },
    pressed: { opacity: 0.6 },
  })
}
