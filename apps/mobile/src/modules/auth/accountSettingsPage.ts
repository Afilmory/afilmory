import { translate } from '@/i18n'
import { definePage } from '@/presentation'

import { AccountSettingsScreen } from './AccountSettingsScreen'

export const accountSettingsPage = definePage<{ startDeletion?: boolean }>({
  Component: AccountSettingsScreen,
  id: 'account-settings',
  parseRouteParams: params => ({ startDeletion: params.delete === '1' }),
  presentation: { detents: [0.55, 0.94], style: 'formSheet' },
  title: translate('account.settings.title'),
})
