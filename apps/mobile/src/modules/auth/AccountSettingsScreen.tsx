import * as AppleAuthentication from 'expo-apple-authentication'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { useTranslation } from '@/i18n'
import { usePageRuntime } from '@/presentation'
import type { Palette } from '@/theme/palette'
import { controlH, font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { isAppleAuthenticationAvailable, requestAppleAuthorization } from './appleAuthentication'
import { deleteAccount, loadAccountDeletionImpact, signOut, useAuth } from './sessionStore'
import type { AccountDeletionImpact, AccountDeletionProof } from './types'

export function AccountSettingsScreen() {
  const { finish, params } = usePageRuntime<{ startDeletion?: boolean }>()
  const { palette } = useTheme()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(palette), [palette])
  const auth = useAuth()
  const [appleAvailable, setAppleAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null)
  const [password, setPassword] = useState('')
  const didStartDeletionRef = useRef(false)

  const inspectDeletion = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [nextImpact, available] = await Promise.all([loadAccountDeletionImpact(), isAppleAuthenticationAvailable()])
      setImpact(nextImpact)
      setAppleAvailable(available)
    }
    catch {
      setError(t('account.deletion.impactFailed'))
    }
    finally {
      setBusy(false)
    }
  }, [t])

  useEffect(() => {
    if (params.startDeletion && !didStartDeletionRef.current) {
      didStartDeletionRef.current = true
      void inspectDeletion()
    }
  }, [inspectDeletion, params.startDeletion])

  const submitDeletion = async (proof: AccountDeletionProof) => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(proof)
      Alert.alert(t('account.deletion.acceptedTitle'), t('account.deletion.acceptedDescription'), [
        { text: t('common.done'), onPress: () => finish() },
      ])
    }
    catch {
      setError(t('account.deletion.failed'))
    }
    finally {
      setBusy(false)
    }
  }

  const confirmPasswordDeletion = () => {
    if (!password) {
      setError(t('account.deletion.passwordRequired'))
      return
    }
    Alert.alert(t('account.deletion.finalTitle'), t('account.deletion.finalDescription'), [
      { style: 'cancel', text: t('common.cancel') },
      {
        style: 'destructive',
        text: t('account.deletion.confirm'),
        onPress: () => void submitDeletion({ password, type: 'password' }),
      },
    ])
  }

  const confirmAppleDeletion = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const authorization = await requestAppleAuthorization()
      await deleteAccount({ identityToken: authorization.identityToken, nonce: authorization.nonce, type: 'apple' })
      Alert.alert(t('account.deletion.acceptedTitle'), t('account.deletion.acceptedDescription'), [
        { text: t('common.done'), onPress: () => finish() },
      ])
    }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      if (!/ERR_REQUEST_CANCELED|cancel/i.test(message)) {
        setError(t('account.deletion.failed'))
      }
    }
    finally {
      setBusy(false)
    }
  }

  if (auth.status !== 'signedIn' || !auth.session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>{t('account.signedOut')}</Text>
      </View>
    )
  }

  if (!impact) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identityCard}>
          <Text style={styles.identityName}>{auth.session.user.name}</Text>
          <Text style={styles.identityEmail}>{auth.session.user.email}</Text>
        </View>
        <View style={styles.actionGroup}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
            onPress={() => void signOut().then(() => finish())}
          >
            <Text style={styles.rowLabel}>{t('common.signOut')}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
            onPress={() => void inspectDeletion()}
          >
            <Text style={styles.dangerLabel}>{t('account.deletion.action')}</Text>
            {busy ? <ActivityIndicator color={palette.danger} /> : null}
          </Pressable>
        </View>
        <Text style={styles.footnote}>{t('account.deletion.entryDescription')}</Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    )
  }

  const supportsPassword = impact.proofMethods.includes('password')
  const supportsApple = impact.proofMethods.includes('apple') && appleAvailable
  const supportsRecentSession = impact.proofMethods.includes('recent-session')

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.warning}>
        <Text style={styles.warningTitle}>{t('account.deletion.title')}</Text>
        <Text style={styles.description}>{t('account.deletion.description')}</Text>
      </View>

      {impact.workspaces.length > 0 ? (
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>{t('account.deletion.workspaces')}</Text>
          {impact.workspaces.map(workspace => (
            <View key={workspace.tenantId} style={styles.summaryRow}>
              <View style={styles.summaryText}>
                <Text style={styles.summaryName}>{workspace.name}</Text>
                <Text style={styles.summaryDetail}>
                  {workspace.action === 'transfer' && workspace.transferTo
                    ? t('account.deletion.transferTo', { name: workspace.transferTo.name })
                    : t('account.deletion.deleteWorkspace')}
                </Text>
              </View>
              <Text style={workspace.action === 'delete' ? styles.dangerBadge : styles.neutralBadge}>
                {t(workspace.action === 'delete' ? 'account.deletion.deleteBadge' : 'account.deletion.transferBadge')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.description}>
        {t('account.deletion.associatedData', {
          joined: impact.joinedWorkspaces.length,
          subscriptions: impact.subscriptions.length,
        })}
      </Text>

      {supportsPassword ? (
        <View style={styles.proofSection}>
          <Text style={styles.sectionTitle}>{t('account.deletion.verifyPassword')}</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!busy}
            placeholder={t('auth.password.password')}
            placeholderTextColor={palette.textMuted}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={confirmPasswordDeletion}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [styles.destructiveButton, pressed && styles.pressed]}
            onPress={confirmPasswordDeletion}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.destructiveLabel}>{t('account.deletion.confirm')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {supportsApple ? (
        <View style={styles.proofSection}>
          <Text style={styles.sectionTitle}>{t('account.deletion.verifyApple')}</Text>
          <View pointerEvents={busy ? 'none' : 'auto'} style={busy && styles.disabled}>
            <AppleAuthentication.AppleAuthenticationButton
              accessibilityLabel={t('account.deletion.verifyApple')}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              cornerRadius={radiusLg}
              style={styles.appleButton}
              onPress={() => void confirmAppleDeletion()}
            />
          </View>
        </View>
      ) : null}

      {supportsRecentSession ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={({ pressed }) => [styles.destructiveButton, pressed && styles.pressed]}
          onPress={() => void submitDeletion({ type: 'recent-session' })}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.destructiveLabel}>{t('account.deletion.confirm')}</Text>
          )}
        </Pressable>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
    content: { gap: 20, padding: 20, paddingBottom: 48 },
    identityCard: {
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: 16,
      gap: 4,
      padding: 18,
    },
    identityName: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 18, fontWeight: '700' },
    identityEmail: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 14 },
    actionGroup: {
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: 16,
      overflow: 'hidden',
    },
    rowButton: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 50,
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    rowLabel: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 15 },
    dangerLabel: { color: palette.danger, fontFamily: font.ui, fontSize: 15 },
    divider: { backgroundColor: palette.border, height: StyleSheet.hairlineWidth, marginLeft: 16 },
    footnote: { color: palette.textMuted, fontFamily: font.ui, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
    warning: {
      backgroundColor: 'rgba(255, 69, 58, 0.10)',
      borderCurve: 'continuous',
      borderRadius: 16,
      gap: 8,
      padding: 16,
    },
    warningTitle: { color: palette.danger, fontFamily: font.ui, fontSize: 20, fontWeight: '700' },
    description: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
    summarySection: { gap: 10 },
    sectionTitle: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 14, fontWeight: '700' },
    summaryRow: {
      alignItems: 'center',
      backgroundColor: palette.bgElement,
      borderCurve: 'continuous',
      borderRadius: 12,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    summaryText: { flex: 1, gap: 3 },
    summaryName: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 14, fontWeight: '600' },
    summaryDetail: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 12 },
    dangerBadge: { color: palette.danger, fontFamily: font.ui, fontSize: 11, fontWeight: '700' },
    neutralBadge: { color: palette.accentHi, fontFamily: font.ui, fontSize: 11, fontWeight: '700' },
    proofSection: { gap: 10 },
    input: {
      backgroundColor: palette.bgElement,
      borderColor: palette.border,
      borderCurve: 'continuous',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 16,
      height: controlH,
      paddingHorizontal: 14,
    },
    destructiveButton: {
      alignItems: 'center',
      backgroundColor: palette.danger,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      height: controlH,
      justifyContent: 'center',
    },
    destructiveLabel: { color: '#ffffff', fontFamily: font.ui, fontSize: 15, fontWeight: '700' },
    appleButton: { height: controlH, width: '100%' },
    disabled: { opacity: 0.45 },
    error: { color: palette.danger, fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
    pressed: { opacity: 0.65 },
  })
}
