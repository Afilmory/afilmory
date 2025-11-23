import { PageTabs } from '~/components/navigation/PageTabs'

const SETTINGS_TABS = [
  {
    id: 'site',
    labelKey: 'settings.nav.site',
    path: '/settings/site',
    end: true,
  },
  {
    id: 'domain',
    labelKey: 'settings.nav.domain',
    path: '/settings/domain',
    end: true,
  },
  {
    id: 'user',
    labelKey: 'settings.nav.user',
    path: '/settings/user',
    end: true,
  },

  {
    id: 'account',
    labelKey: 'settings.nav.account',
    path: '/settings/account',
    end: true,
  },

  {
    id: 'data',
    labelKey: 'settings.nav.data',
    path: '/settings/data',
    end: true,
  },
] as const

type SettingsNavigationProps = {
  active: (typeof SETTINGS_TABS)[number]['id']
}

export function SettingsNavigation({ active }: SettingsNavigationProps) {
  return (
    <PageTabs
      activeId={active}
      items={SETTINGS_TABS.map((tab) => ({
        id: tab.id,
        labelKey: tab.labelKey,
        to: tab.path,
        end: tab.end,
      }))}
    />
  )
}
