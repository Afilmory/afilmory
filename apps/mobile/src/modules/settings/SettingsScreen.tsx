import { Image } from 'expo-image'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { SAAS_BASE_DOMAIN } from '@/api/client'
import { signOut, useAuth } from '@/modules/auth/sessionStore'
import { SignInSection } from '@/modules/auth/SignInSection'
import { AppHeader } from '@/modules/shell/AppHeader'
import type { Palette } from '@/theme/palette'
import { controlH, font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

export function SettingsScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])
  const auth = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) {
      return
    }
    setSigningOut(true)
    try {
      await signOut()
    }
    finally {
      setSigningOut(false)
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader />
      {auth.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.textSecondary} />
        </View>
      ) : auth.status === 'signedOut' ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.root}
        >
          <SignInSection />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.root}
        >
          <View style={styles.card}>
            <View style={styles.accountRow}>
              {auth.session?.user.image ? (
                <Image source={{ uri: auth.session.user.image }} style={styles.avatar} transition={150} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(auth.session?.user.name ?? '?').slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.accountText}>
                <Text numberOfLines={1} style={styles.name}>
                  {auth.session?.user.name}
                </Text>
                <Text numberOfLines={1} style={styles.email}>
                  {auth.session?.user.email}
                </Text>
              </View>
            </View>
            {auth.session?.tenant ? (
              <View style={styles.tenantRow}>
                <Text numberOfLines={1} style={styles.tenantName}>
                  {auth.session.tenant.name}
                </Text>
                <Text numberOfLines={1} style={styles.tenantHost}>
                  {auth.session.tenant.slug}
                  .
                  {SAAS_BASE_DOMAIN}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            disabled={signingOut}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
            onPress={() => void handleSignOut()}
          >
            {signingOut ? (
              <ActivityIndicator color={palette.danger} />
            ) : (
              <Text style={styles.signOutLabel}>Sign out</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bgCanvas },
    center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    content: { gap: 14, paddingHorizontal: 16, paddingTop: 20 },
    card: {
      backgroundColor: palette.bgSurface,
      borderColor: palette.border,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    accountRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    avatar: {
      borderRadius: 24,
      height: 48,
      width: 48,
    },
    avatarFallback: {
      alignItems: 'center',
      backgroundColor: palette.accentDim,
      justifyContent: 'center',
    },
    avatarInitial: {
      color: palette.accent,
      fontFamily: font.ui,
      fontSize: 19,
      fontWeight: '700',
    },
    accountText: { flex: 1, gap: 2 },
    name: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 17,
      fontWeight: '600',
    },
    email: {
      color: palette.textSecondary,
      fontFamily: font.ui,
      fontSize: 13,
    },
    tenantRow: {
      borderTopColor: palette.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 2,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    tenantName: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 15,
      fontWeight: '500',
    },
    tenantHost: {
      color: palette.textMuted,
      fontFamily: font.mono,
      fontSize: 12,
    },
    signOutButton: {
      alignItems: 'center',
      backgroundColor: palette.bgSurface,
      borderColor: palette.border,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      height: controlH,
      justifyContent: 'center',
    },
    signOutLabel: {
      color: palette.danger,
      fontFamily: font.ui,
      fontSize: 15,
      fontWeight: '600',
    },
    pressed: { opacity: 0.7 },
  })
}
