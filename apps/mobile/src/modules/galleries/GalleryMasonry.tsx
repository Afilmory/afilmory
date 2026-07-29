import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { Palette } from '@/theme/palette'
import { font } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { thumbHashHexToBase64 } from './thumbhash'
import type { GalleryPhoto } from './types'
import { useGalleryManifest } from './useGalleryManifest'

const GAP = 4

export function GalleryMasonry({ slug }: { slug: string }) {
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])
  const { width } = useWindowDimensions()
  const tileWidth = (width - GAP) / 2 - GAP
  const { error, loading, photos, retry } = useGalleryManifest(slug)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.textSecondary} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Failed to load photos</Text>
        <Text numberOfLines={2} style={styles.errorDetail}>
          {error.message}
        </Text>
        <Pressable
          accessibilityLabel="Retry loading photos"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          onPress={retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlashList
      masonry
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={photos}
      keyExtractor={(item: GalleryPhoto) => item.id}
      numColumns={2}
      renderItem={({ item }: { item: GalleryPhoto }) => (
        <View style={styles.tileWrapper}>
          <PhotoTile height={Math.round(tileWidth / item.aspectRatio)} photo={item} styles={styles} />
        </View>
      )}
      showsVerticalScrollIndicator={false}
    />
  )
}

function PhotoTile({
  height,
  photo,
  styles,
}: {
  height: number
  photo: GalleryPhoto
  styles: ReturnType<typeof createStyles>
}) {
  const thumbhash = photo.thumbHash ? thumbHashHexToBase64(photo.thumbHash) : null
  return (
    <Image
      contentFit="cover"
      placeholder={thumbhash ? { thumbhash } : undefined}
      recyclingKey={photo.id}
      source={{ uri: photo.thumbnailUrl }}
      style={[styles.tile, { height }]}
      transition={150}
    />
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    center: {
      alignItems: 'center',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    listContent: {
      paddingBottom: 120,
      paddingHorizontal: GAP / 2,
      paddingTop: GAP / 2,
    },
    tileWrapper: { padding: GAP / 2 },
    tile: {
      backgroundColor: palette.bgElement,
      width: '100%',
    },
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
