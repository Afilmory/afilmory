import * as AppleAuthentication from 'expo-apple-authentication'
import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import githubMark from '@/assets/images/github-mark.svg'
import googleG from '@/assets/images/google-g.png'
import { useTranslation } from '@/i18n'
import type { Palette } from '@/theme/palette'
import { controlH, font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { fetchAppleAuthenticationConfiguration } from './api'
import { isAppleAuthenticationAvailable } from './appleAuthentication'
import { signInWithApple, signInWithPassword, signInWithProvider } from './sessionStore'
import type { AuthProviderId } from './types'

const PROVIDERS: Array<{ id: AuthProviderId, labelKey: string, logo: number, tinted: boolean }> = [
  { id: 'github', labelKey: 'auth.continue.github', logo: githubMark, tinted: true },
  { id: 'google', labelKey: 'auth.continue.google', logo: googleG, tinted: false },
]

const USER_CANCELLED_PATTERN = /cancel|dismiss|ERR_REQUEST_CANCELED/i
type BusyAction = 'apple' | 'password' | AuthProviderId

export function SignInSection({ compact = false, onSignedIn }: { compact?: boolean, onSignedIn?: () => void }) {
  const { palette } = useTheme()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(palette), [palette])
  const [appleAvailable, setAppleAvailable] = useState(false)
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  useEffect(() => {
    void Promise.all([isAppleAuthenticationAvailable(), fetchAppleAuthenticationConfiguration()])
      .then(([deviceAvailable, configuration]) => setAppleAvailable(deviceAvailable && configuration.enabled))
      .catch(() => setAppleAvailable(false))
  }, [])

  const runSignIn = async (action: BusyAction, operation: () => Promise<void>) => {
    if (busyAction) {
      return
    }
    setBusyAction(action)
    setError(null)
    try {
      await operation()
      onSignedIn?.()
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!USER_CANCELLED_PATTERN.test(message)) {
        setError(t('auth.failed'))
      }
    }
    finally {
      setBusyAction(null)
    }
  }

  const submitPassword = () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) {
      setError(t('auth.password.required'))
      return
    }
    void runSignIn('password', () => signInWithPassword(normalizedEmail, password))
  }

  return (
    <View style={styles.root}>
      {appleAvailable ? (
        <View
          pointerEvents={busyAction ? 'none' : 'auto'}
          style={busyAction && busyAction !== 'apple' && styles.disabled}
        >
          {busyAction === 'apple' ? (
            <View style={styles.appleBusy}>
              <ActivityIndicator color="#000000" />
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              accessibilityLabel={t('auth.continue.apple')}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              cornerRadius={radiusLg}
              style={styles.appleButton}
              onPress={() => void runSignIn('apple', signInWithApple)}
            />
          )}
        </View>
      ) : null}

      <View style={compact ? styles.providerRow : styles.providerStack}>
        {PROVIDERS.map((provider) => {
          const label = t(provider.labelKey)
          return (
            <Pressable
              key={provider.id}
              accessibilityLabel={label}
              accessibilityRole="button"
              disabled={busyAction !== null}
              style={({ pressed }) => [
                styles.providerButton,
                compact && styles.providerButtonCompact,
                busyAction !== null && busyAction !== provider.id && styles.disabled,
                pressed && styles.pressed,
              ]}
              onPress={() => void runSignIn(provider.id, () => signInWithProvider(provider.id))}
            >
              {busyAction === provider.id ? (
                <ActivityIndicator color={palette.textPrimary} />
              ) : (
                <View style={styles.providerContent}>
                  <Image
                    source={provider.logo}
                    style={styles.providerLogo}
                    tintColor={provider.tinted ? palette.textPrimary : undefined}
                  />
                  <Text numberOfLines={1} style={styles.providerLabel}>
                    {label}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busyAction !== null}
        style={({ pressed }) => [styles.passwordToggle, pressed && styles.pressed]}
        onPress={() => {
          setError(null)
          setShowPasswordForm(value => !value)
        }}
      >
        <Text style={styles.passwordToggleLabel}>
          {t(showPasswordForm ? 'auth.password.hide' : 'auth.password.show')}
        </Text>
      </Pressable>

      {showPasswordForm ? (
        <View style={styles.passwordForm}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            editable={busyAction === null}
            inputMode="email"
            keyboardType="email-address"
            placeholder={t('auth.password.email')}
            placeholderTextColor={palette.textMuted}
            returnKeyType="next"
            style={styles.input}
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            editable={busyAction === null}
            placeholder={t('auth.password.password')}
            placeholderTextColor={palette.textMuted}
            returnKeyType="go"
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submitPassword}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busyAction !== null}
            style={({ pressed }) => [styles.passwordButton, pressed && styles.pressed]}
            onPress={submitPassword}
          >
            {busyAction === 'password' ? (
              <ActivityIndicator color={palette.accentContrast} />
            ) : (
              <Text style={styles.passwordButtonLabel}>{t('auth.password.submit')}</Text>
            )}
          </Pressable>
          <Text style={styles.passwordNote}>{t('auth.password.reviewNote')}</Text>
        </View>
      ) : null}

      {error || !compact ? (
        <View style={[styles.errorSlot, compact && styles.errorSlotCompact]}>
          {error ? (
            <Text accessibilityRole="alert" numberOfLines={3} style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: { gap: 10 },
    appleButton: { height: controlH, width: '100%' },
    appleBusy: {
      alignItems: 'center',
      backgroundColor: '#ffffff',
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      height: controlH,
      justifyContent: 'center',
    },
    providerStack: { gap: 10 },
    providerRow: { flexDirection: 'row', gap: 8 },
    providerButton: {
      alignItems: 'center',
      backgroundColor: palette.bgElement,
      borderColor: palette.border,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      height: controlH,
      justifyContent: 'center',
    },
    providerButtonCompact: { flex: 1, paddingHorizontal: 10 },
    disabled: { opacity: 0.45 },
    providerContent: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 10 },
    providerLogo: { height: 18, width: 18 },
    providerLabel: {
      color: palette.textPrimary,
      flexShrink: 1,
      fontFamily: font.ui,
      fontSize: 15,
      fontWeight: '600',
    },
    passwordToggle: { alignItems: 'center', minHeight: 32, justifyContent: 'center' },
    passwordToggleLabel: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 13, fontWeight: '600' },
    passwordForm: { gap: 10 },
    input: {
      backgroundColor: palette.bgElement,
      borderColor: palette.border,
      borderCurve: 'continuous',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 15,
      height: controlH,
      paddingHorizontal: 14,
    },
    passwordButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      height: controlH,
      justifyContent: 'center',
    },
    passwordButtonLabel: { color: palette.accentContrast, fontFamily: font.ui, fontSize: 15, fontWeight: '700' },
    passwordNote: { color: palette.textMuted, fontFamily: font.ui, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    errorSlot: { justifyContent: 'center', minHeight: 44 },
    errorSlotCompact: { minHeight: 0 },
    error: { color: palette.danger, fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
    pressed: { opacity: 0.7 },
  })
}
