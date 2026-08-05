import { translate } from '@/i18n'
import { definePage } from '@/presentation'

import { WorkspaceSetupScreen } from './WorkspaceSetupScreen'

export const workspaceSetupPage = definePage<undefined, 'created' | 'signed-out'>({
  Component: WorkspaceSetupScreen,
  id: 'workspace-setup',
  presentation: { detents: [0.68, 0.94], headerShown: false, style: 'formSheet' },
  title: translate('workspace.setup.pageTitle'),
})
