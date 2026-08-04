import { translate } from '@/i18n'
import { definePage } from '@/presentation'

import { WorkspaceSetupScreen } from './WorkspaceSetupScreen'

export const workspaceSetupPage = definePage({
  Component: WorkspaceSetupScreen,
  id: 'workspace-setup',
  presentation: { detents: [0.68, 0.94], style: 'formSheet' },
  title: translate('workspace.setup.pageTitle'),
})
