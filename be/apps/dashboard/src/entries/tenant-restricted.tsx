import '../styles/index.css'

import { createRoot } from 'react-dom/client'

import { I18nProvider } from '~/providers/i18n-provider'

import { TenantRestrictedStandalone } from '../modules/welcome/components/TenantRestrictedStandalone'

const root = document.querySelector('#root')

if (!root) {
  throw new Error('Root element not found for tenant restricted entry.')
}

createRoot(root).render(
  <I18nProvider>
    <TenantRestrictedStandalone />
  </I18nProvider>,
)
