import '../styles/index.css'

import { createRoot } from 'react-dom/client'

import { I18nProvider } from '~/providers/i18n-provider'

import { TenantMissingStandalone } from '../modules/welcome/components/TenantMissingStandalone'

const root = document.querySelector('#root')

if (!root) {
  throw new Error('Root element not found for tenant missing entry.')
}

createRoot(root).render(
  <I18nProvider>
    <TenantMissingStandalone />
  </I18nProvider>,
)
