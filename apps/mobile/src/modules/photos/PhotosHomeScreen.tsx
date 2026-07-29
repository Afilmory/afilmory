import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { useAuth } from '@/modules/auth/sessionStore'
import { GalleryMasonry } from '@/modules/galleries/GalleryMasonry'
import type { Palette } from '@/theme/palette'
import { font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

export function PhotosHomeScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])
  const auth = useAuth()
  const router = useRouter()

  if (auth.status === 'loading') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={palette.textSecondary} />
      </View>
    )
  }

  if (auth.status === 'signedOut') {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.heroTitle}>Your gallery</Text>
        <Text style={styles.heroSubtitle}>Sign in with your workspace to see your own photos here.</Text>
        <Pressable
          accessibilityLabel="Go to sign in"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          onPress={() => router.navigate('/settings')}
        >
          <Text style={styles.heroButtonLabel}>Sign in</Text>
        </Pressable>
      </View>
    )
  }

  const tenant = auth.session?.tenant
  if (!tenant || tenant.status !== 'active') {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.heroTitle}>Workspace pending</Text>
        <Text style={styles.heroSubtitle}>
          This workspace has not finished registering. Complete setup on the web, then come back.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <GalleryMasonry slug={tenant.slug} />
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bgCanvas },
    center: {
      alignItems: 'center',
      gap: 10,
      justifyContent: 'center',
      paddingHorizontal: 36,
    },
    heroTitle: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    heroSubtitle: {
      color: palette.textSecondary,
      fontFamily: font.ui,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    heroButton: {
      backgroundColor: palette.accent,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      marginTop: 10,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    heroButtonLabel: {
      color: palette.accentContrast,
      fontFamily: font.ui,
      fontSize: 16,
      fontWeight: '600',
    },
    pressed: { opacity: 0.75 },
  })
}
