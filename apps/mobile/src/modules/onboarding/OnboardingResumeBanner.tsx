import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTranslation } from '@/i18n'
import { useAuth } from '@/modules/auth/sessionStore'
import type { Palette } from '@/theme/palette'
import { font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import { requestMobileOnboardingPresentation } from './onboardingPresentationRequestStore'
import { useMobileOnboarding } from './onboardingStore'

const TAB_BAR_CLEARANCE = 72

export function OnboardingResumeBanner() {
  const auth = useAuth()
  const onboarding = useMobileOnboarding()
  const { bottom } = useSafeAreaInsets()
  const { palette } = useTheme()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(palette), [palette])
  const readiness = onboarding.readiness

  if (auth.status !== 'signedIn' || !readiness || readiness.state === 'ready') {
    return null
  }

  const waitingForOwner = readiness.state === 'owner_action_required'

  return (
    <Pressable
      accessibilityHint={t(
        waitingForOwner ? 'onboarding.resume.ownerActionDescription' : 'onboarding.resume.description',
      )}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { bottom: bottom + TAB_BAR_CLEARANCE }, pressed && styles.pressed]}
      onPress={requestMobileOnboardingPresentation}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>
          {t(waitingForOwner ? 'onboarding.resume.ownerActionTitle' : 'onboarding.resume.title')}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {t(waitingForOwner ? 'onboarding.resume.ownerActionDescription' : 'onboarding.resume.description')}
        </Text>
      </View>
      <Text style={styles.action}>
        {t(waitingForOwner ? 'onboarding.resume.viewStatus' : 'onboarding.resume.action')}
      </Text>
    </Pressable>
  )
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    action: {
      color: palette.accentHi,
      fontFamily: font.ui,
      fontSize: 13,
      fontWeight: '700',
    },
    card: {
      alignItems: 'center',
      backgroundColor: palette.bgSurface,
      borderColor: palette.accentLine,
      borderCurve: 'continuous',
      borderRadius: radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 8,
      flexDirection: 'row',
      gap: 16,
      left: 16,
      paddingHorizontal: 18,
      paddingVertical: 14,
      position: 'absolute',
      right: 16,
      shadowColor: '#000000',
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
      zIndex: 20,
    },
    copy: { flex: 1, gap: 3 },
    description: {
      color: palette.textSecondary,
      fontFamily: font.ui,
      fontSize: 12,
      lineHeight: 17,
    },
    pressed: { opacity: 0.72 },
    title: {
      color: palette.textPrimary,
      fontFamily: font.ui,
      fontSize: 14,
      fontWeight: '700',
    },
  })
}
