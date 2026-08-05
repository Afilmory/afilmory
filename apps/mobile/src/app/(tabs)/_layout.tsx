import { Redirect, useRouter, useSegments } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useCallback, useRef } from 'react'

import { useTranslation } from '@/i18n'
import { useAuth } from '@/modules/auth/sessionStore'
import { createDevLabShortcutState, registerDevLabTabPress } from '@/modules/shell/devLabShortcut'
import { getAvailableTabNames, isVisitorStatus, shouldShowTabBar } from '@/modules/shell/tabAccess'
import { useTheme } from '@/theme/useTheme'

export default function TabLayout() {
  const { palette } = useTheme()
  const { t } = useTranslation()
  const auth = useAuth()
  const router = useRouter()
  const segments = useSegments() as string[]
  const isStudio = segments.includes('studio')
  const isExplore = segments.includes('explore')
  const availableTabs = getAvailableTabNames(auth.status)
  const isVisitor = isVisitorStatus(auth.status)
  const devLabShortcutStateRef = useRef(createDevLabShortcutState())
  const handleTabPress = useCallback(
    (tabName: string) => {
      if (!__DEV__) {
        return
      }

      const result = registerDevLabTabPress(devLabShortcutStateRef.current, tabName, Date.now())
      devLabShortcutStateRef.current = result.state

      if (result.shouldOpen) {
        router.push('/dev')
      }
    },
    [router],
  )

  if (auth.status === 'loading') {
    return null
  }

  if (isVisitor && !isExplore) {
    return <Redirect href="/explore" />
  }

  return (
    <NativeTabs
      hidden={!shouldShowTabBar(auth.status)}
      iconColor={{ default: palette.textSecondary, selected: palette.accent }}
      minimizeBehavior={isStudio ? 'never' : 'onScrollDown'}
      screenListeners={({ route }) => ({
        tabPress: () => handleTabPress(route.name),
      })}
      sidebarAdaptable
      tintColor={palette.accent}
    >
      {availableTabs.includes('photos') ? (
        <NativeTabs.Trigger name="photos">
          <NativeTabs.Trigger.Icon
            md="photo_library"
            sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }}
          />
          <NativeTabs.Trigger.Label>{t('tabs.photos')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
      {availableTabs.includes('map') ? (
        <NativeTabs.Trigger name="map">
          <NativeTabs.Trigger.Icon md="map" sf={{ default: 'map', selected: 'map.fill' }} />
          <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Icon md="explore" sf="safari" />
        <NativeTabs.Trigger.Label>{t('tabs.explore')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {availableTabs.includes('studio') ? (
        <NativeTabs.Trigger name="studio">
          <NativeTabs.Trigger.Icon
            md="dashboard"
            sf={{ default: 'rectangle.3.group', selected: 'rectangle.3.group.fill' }}
          />
          <NativeTabs.Trigger.Label>{t('tabs.studio')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  )
}
