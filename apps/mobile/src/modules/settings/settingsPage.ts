import { definePage } from '@/presentation'

import { SettingsScreen } from './SettingsScreen'

export const settingsPage = definePage({
  Component: SettingsScreen,
  id: 'settings',
  presentation: { style: 'fullScreen' },
  title: 'Settings',
})
