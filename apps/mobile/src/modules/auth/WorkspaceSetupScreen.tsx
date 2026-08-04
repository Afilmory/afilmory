import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { useTranslation } from '@/i18n'
import { usePageRuntime } from '@/presentation'
import type { Palette } from '@/theme/palette'
import { controlH, font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { createInitialWorkspace, signOut } from './sessionStore'

const INVALID_SLUG_PATTERN = /[^a-z0-9-]/g
const REPEATED_HYPHEN_PATTERN = /-{2,}/g
const EDGE_HYPHEN_PATTERN = /^-+|-+$/g

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(INVALID_SLUG_PATTERN, '')
    .replaceAll(REPEATED_HYPHEN_PATTERN, '-')
    .replaceAll(EDGE_HYPHEN_PATTERN, '')
}

export function WorkspaceSetupScreen() {
  const { finish } = usePageRuntime()
  const { palette } = useTheme()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(palette), [palette])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  const submit = async () => {
    const normalizedName = name.trim()
    const normalizedSlug = normalizeSlug(slug || name)
    if (!normalizedName || normalizedSlug.length < 2) {
      setError(t('workspace.setup.required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createInitialWorkspace(normalizedName, normalizedSlug)
      finish()
    }
    catch {
      setError(t('workspace.setup.failed'))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title}>{t('workspace.setup.title')}</Text>
        <Text style={styles.description}>{t('workspace.setup.description')}</Text>
      </View>
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('workspace.setup.name')}</Text>
          <TextInput
            autoFocus
            editable={!busy}
            placeholder={t('workspace.setup.namePlaceholder')}
            placeholderTextColor={palette.textMuted}
            returnKeyType="next"
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value)
              if (!slugEdited) {
                setSlug(normalizeSlug(value))
              }
            }}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('workspace.setup.slug')}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="my-gallery"
            placeholderTextColor={palette.textMuted}
            returnKeyType="done"
            style={styles.input}
            value={slug}
            onChangeText={(value) => {
              setSlugEdited(true)
              setSlug(normalizeSlug(value))
            }}
            onSubmitEditing={() => void submit()}
          />
          <Text style={styles.hint}>{t('workspace.setup.slugHint')}</Text>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        onPress={() => void submit()}
      >
        {busy ? (
          <ActivityIndicator color={palette.accentContrast} />
        ) : (
          <Text style={styles.primaryLabel}>{t('workspace.setup.submit')}</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        onPress={() => void signOut().then(() => finish())}
      >
        <Text style={styles.secondaryLabel}>{t('common.signOut')}</Text>
      </Pressable>
    </ScrollView>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    content: { gap: 20, padding: 24, paddingBottom: 40 },
    intro: { gap: 8 },
    title: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 24, fontWeight: '700' },
    description: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 15, lineHeight: 22 },
    form: { gap: 18 },
    field: { gap: 7 },
    label: { color: palette.textPrimary, fontFamily: font.ui, fontSize: 13, fontWeight: '600' },
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
    hint: { color: palette.textMuted, fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
    error: { color: palette.danger, fontFamily: font.ui, fontSize: 13 },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      height: controlH,
      justifyContent: 'center',
    },
    primaryLabel: { color: palette.accentContrast, fontFamily: font.ui, fontSize: 15, fontWeight: '700' },
    secondaryButton: { alignItems: 'center', height: controlH, justifyContent: 'center' },
    secondaryLabel: { color: palette.textSecondary, fontFamily: font.ui, fontSize: 15, fontWeight: '600' },
    pressed: { opacity: 0.65 },
  })
}
