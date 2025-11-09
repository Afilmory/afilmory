export type OnboardingSettingKey =
  | 'ai.openai.apiKey'
  | 'ai.openai.baseUrl'
  | 'ai.embedding.model'
  | 'http.cors.allowedOrigins'
  | 'services.amap.apiKey'

export type OnboardingSiteSettingKey = 'site.name' | 'site.title' | 'site.description'

export type SettingFieldDefinition = {
  key: OnboardingSettingKey
  label: string
  description: string
  placeholder?: string
  helper?: string
  sensitive?: boolean
  multiline?: boolean
}

export type SettingSectionDefinition = {
  id: string
  title: string
  description: string
  fields: SettingFieldDefinition[]
}

export const ONBOARDING_SETTING_SECTIONS: SettingSectionDefinition[] = [
  {
    id: 'ai',
    title: 'AI & Embeddings',
    description:
      'Optional integrations for AI powered features. Provide your OpenAI credentials and preferred embedding model.',
    fields: [
      {
        key: 'ai.openai.apiKey',
        label: 'OpenAI API Key',
        description: 'Used for generating captions, titles, and AI assistance across the platform.',
        placeholder: 'sk-proj-xxxxxxxxxxxxxxxx',
        sensitive: true,
      },
      {
        key: 'ai.openai.baseUrl',
        label: 'OpenAI Base URL',
        description: 'Override the default api.openai.com endpoint if you proxy requests.',
        placeholder: 'https://api.openai.com/v1',
      },
      {
        key: 'ai.embedding.model',
        label: 'Embedding Model',
        description: 'Model identifier to compute embeddings for search and semantic features.',
        placeholder: 'text-embedding-3-large',
      },
    ],
  },
  {
    id: 'map',
    title: 'Map Services',
    description: 'Connect Gaode (Amap) maps to unlock geolocation previews for your photos.',
    fields: [
      {
        key: 'services.amap.apiKey',
        label: 'Gaode (Amap) API Key',
        description: 'Required to render photo locations on the dashboard.',
        placeholder: 'your-amap-api-key',
        sensitive: true,
      },
    ],
  },
  {
    id: 'network',
    title: 'Network & CORS',
    description: 'Restrict which origins can access the backend APIs.',
    fields: [
      {
        key: 'http.cors.allowedOrigins',
        label: 'Allowed Origins',
        description: 'Comma separated list of origins. Example: https://dashboard.afilmory.com, https://afilmory.app',
        placeholder: 'https://dashboard.afilmory.com, https://afilmory.app',
        helper: 'Leave empty to keep the default wildcard policy during setup.',
        multiline: true,
      },
    ],
  },
]

export const ONBOARDING_TOTAL_STEPS = 6 as const
export const ONBOARDING_STEP_ORDER = ['welcome', 'tenant', 'site', 'admin', 'settings', 'review'] as const

export type OnboardingStepId = (typeof ONBOARDING_STEP_ORDER)[number]

export type OnboardingStep = {
  id: OnboardingStepId
  title: string
  description: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Verify environment and prepare initialization.',
  },
  {
    id: 'tenant',
    title: 'Tenant Profile',
    description: 'Name your workspace and choose a slug.',
  },
  {
    id: 'site',
    title: 'Site Branding',
    description: 'Set the public gallery information shown to your visitors.',
  },
  {
    id: 'admin',
    title: 'Administrator',
    description: 'Create the first tenant admin account.',
  },
  {
    id: 'settings',
    title: 'Platform Settings',
    description: 'Set optional integration keys before launch.',
  },
  {
    id: 'review',
    title: 'Review & Launch',
    description: 'Confirm details and finalize initialization.',
  },
]
