import { NativeTabs } from 'expo-router/unstable-native-tabs'

import { useTheme } from '@/theme/useTheme'

export default function TabLayout() {
  const { palette } = useTheme()

  return (
    <NativeTabs iconColor={{ default: palette.textSecondary, selected: palette.accent }} tintColor={palette.accent}>
      <NativeTabs.Trigger name="photos">
        <NativeTabs.Trigger.Icon
          md="photo_library"
          sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }}
        />
        <NativeTabs.Trigger.Label>Photos</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Icon md="explore" sf="safari" />
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon md="settings" sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
