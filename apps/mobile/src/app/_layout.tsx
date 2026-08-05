import { DarkTheme, Stack, ThemeProvider } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { LogBox, Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { waitForEnvironment } from '@/api/environment'
import { i18n } from '@/i18n'
import { addAppleCredentialRevokeListener } from '@/modules/auth/appleAuthentication'
import { waitForAuthStorage } from '@/modules/auth/authStorage'
import { clearLocalAuthentication, hydrateAuth } from '@/modules/auth/sessionStore'
import { PresentationHost } from '@/presentation'
import { useTheme as useAppTheme } from '@/theme/useTheme'

LogBox.ignoreAllLogs(true)

export default function RootLayout() {
  const { palette } = useAppTheme()

  const [environmentReady, setEnvironmentReady] = useState(false)

  // Nothing may issue a request before the API environment override resolves,
  // otherwise the first fetch races against the production default.
  useEffect(() => {
    void Promise.all([waitForEnvironment(), waitForAuthStorage()]).then(() => {
      setEnvironmentReady(true)
      hydrateAuth()
    })
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return
    }
    const subscription = addAppleCredentialRevokeListener(() => {
      void clearLocalAuthentication()
    })
    return () => subscription.remove()
  }, [])
  const navigationTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: palette.bgCanvas,
        border: palette.border,
        card: palette.bgCanvas,
        primary: palette.accent,
        text: palette.textPrimary,
      },
    }),
    [palette],
  )

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: palette.bgCanvas }]}>
        <SafeAreaProvider>
          <ThemeProvider value={navigationTheme}>
            {environmentReady ? (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                {__DEV__ ? <Stack.Screen name="dev" /> : null}
              </Stack>
            ) : null}
            <PresentationHost />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
