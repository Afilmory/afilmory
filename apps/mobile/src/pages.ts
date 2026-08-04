import { accountSettingsPage } from '@/modules/auth/accountSettingsPage'
import { signInPage } from '@/modules/auth/signInPage'
import { workspaceSetupPage } from '@/modules/auth/workspaceSetupPage'

export const Pages = {
  accountSettings: accountSettingsPage,
  signIn: signInPage,
  workspaceSetup: workspaceSetupPage,
} as const
