import { getI18n } from '~/i18n'

import { MANAGED_STORAGE_ACTIVE_ID, storageProvidersI18nKeys } from './constants'
import type { StorageProvider, StorageProviderType } from './types'

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 10)
}

function normalizeConfigRecord(config: Record<string, unknown>): Record<string, string> {
  return Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = typeof value === 'string' ? value : value == null ? '' : String(value)
    return acc
  }, {})
}

function coerceProvider(input: unknown): StorageProvider | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const i18n = getI18n()
  const record = input as Record<string, unknown>
  const typeInput = typeof record.type === 'string' ? record.type.trim() : ''
  const type: StorageProviderType = typeInput.length > 0 ? typeInput : 's3'
  const configInput =
    record.config && typeof record.config === 'object' && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {}

  const provider: StorageProvider = {
    id: typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : generateId(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : i18n.t(storageProvidersI18nKeys.card.untitled),
    type,
    config: normalizeConfigRecord(configInput),
  }

  if (typeof record.createdAt === 'string') {
    provider.createdAt = record.createdAt
  }

  if (typeof record.updatedAt === 'string') {
    provider.updatedAt = record.updatedAt
  }

  return provider
}

export function parseStorageProviders(raw: string | null): StorageProvider[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((item) => coerceProvider(item)).filter((item): item is StorageProvider => item !== null)
  } catch {
    return []
  }
}

export function serializeStorageProviders(providers: readonly StorageProvider[]): string {
  return JSON.stringify(
    providers.map((provider) => ({
      ...provider,
      config: normalizeConfigRecord(provider.config),
    })),
  )
}

export function normalizeStorageProviderConfig(provider: StorageProvider): StorageProvider {
  return {
    ...provider,
    config: normalizeConfigRecord(provider.config),
  }
}

export function createEmptyProvider(type: StorageProviderType): StorageProvider {
  const timestamp = new Date().toISOString()
  const i18n = getI18n()
  return {
    id: '',
    name: i18n.t(storageProvidersI18nKeys.card.untitled),
    type,
    config: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function ensureActiveProviderId(providers: readonly StorageProvider[], activeId: string | null): string | null {
  if (!activeId) {
    return null
  }

  if (activeId === MANAGED_STORAGE_ACTIVE_ID) {
    return activeId
  }

  return providers.some((provider) => provider.id === activeId) ? activeId : null
}

export function reorderProvidersByActive(
  providers: readonly StorageProvider[],
  activeId: string | null,
): StorageProvider[] {
  if (!activeId) {
    return [...providers]
  }

  const i18n = getI18n()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const collator = new Intl.Collator(locale)

  return [...providers].sort((a, b) => {
    if (a.id === activeId) return -1
    if (b.id === activeId) return 1
    const nameA = a.name || i18n.t(storageProvidersI18nKeys.card.untitled)
    const nameB = b.name || i18n.t(storageProvidersI18nKeys.card.untitled)
    return collator.compare(nameA, nameB)
  })
}
