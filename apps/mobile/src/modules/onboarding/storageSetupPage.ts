import { translate } from '@/i18n'
import { definePage } from '@/presentation'

import { StorageSetupScreen } from './StorageSetupScreen'

export type StorageSetupResult = 'completed' | 'dismissed' | 'handoff-opened' | 'signed-out'

export const storageSetupPage = definePage<undefined, StorageSetupResult>({
  Component: StorageSetupScreen,
  id: 'storage-setup',
  presentation: { detents: [0.78, 0.96], headerShown: false, style: 'formSheet' },
  title: translate('onboarding.storage.pageTitle'),
})
