import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import type { Palette } from '@/theme/palette'
import { controlH, font, radius } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { signInWithProvider } from './sessionStore'
import type { AuthProviderId } from './types'

const PROVIDERS: Array<{ id: AuthProviderId, label: string }> = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
]

export function SignInSection() {
  const { palette } = useTheme()
  const styles = useMemo(() => createStyles(palette), [palette])
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (provider: AuthProviderId) => {
    if (busyProvider) {
      return
    }
    setBusyProvider(provider)
    setError(null)
    try {
      await signInWithProvider(provider)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setBusyProvider(null)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Use the account that owns your gallery.</Text>
      {PROVIDERS.map(provider => (
        <Pressable
          key={provider.id}
          accessibilityLabel={provider.label}
          accessibilityRole="button"
          disabled={busyProvider !== null}
          style={({ pressed }) => [
            styles.providerButton,
            busyProvider !== null && styles.providerButtonDisabled,
            pressed && styles.pressed,
          ]}
          onPress={() => void handleSignIn(provider.id)}
        >
          {busyProvider === provider.id ? (
            <ActivityIndicator color={palette.textPrimary} />
          ) : (
            <Text style={styles.providerLabel}>{provider.label}</Text>
          )}
        </Pressable>
      ))}
      {error ? (
        <Text numberOfLines={3} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { gap: 10, paddingHorizontal: 16, paddingTop: 24 },
    title: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.35,
    },
    subtitle: {
      color: palette.textSecondary,
      fontFamily: font.ui,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 6,
    },
    providerButton: {
      alignItems: 'center',
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: radius + 4,
      height: controlH,
      justifyContent: 'center',
    },
    providerButtonDisabled: { opacity: 0.45 },
    providerLabel: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 15,
      fontWeight: '600',
    },
    error: {
      color: palette.danger,
      fontFamily: font.ui,
      fontSize: 13,
      marginTop: 4,
    },
    pressed: { opacity: 0.7 },
  })
}
