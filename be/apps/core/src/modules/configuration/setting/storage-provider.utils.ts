import { randomUUID } from 'node:crypto'

import { STORAGE_PROVIDER_SECRET_PLACEHOLDER } from '@afilmory/utils'

import { STORAGE_PROVIDER_SENSITIVE_FIELDS } from './storage-provider.constants'

export interface BuilderStorageProvider {
  id: string
  name: string
  type: string
  config: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

function normalizeConfig(config: unknown): Record<string, string> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {}
  }

  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(config)) {
    result[key] = typeof value === 'string' ? value : value == null ? '' : String(value)
  }

  return result
}

function normalizeProvider(input: unknown): BuilderStorageProvider | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const record = input as Record<string, unknown>
  const now = new Date().toISOString()

  return {
    id: typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : randomUUID(),
    name: typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : '未命名存储',
    type: typeof record.type === 'string' ? record.type : 's3',
    config: normalizeConfig(record.config),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  }
}

export function parseStorageProviders(raw: string | null): BuilderStorageProvider[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((item) => normalizeProvider(item)).filter((item): item is BuilderStorageProvider => item !== null)
  } catch {
    return []
  }
}

export function serializeStorageProviders(providers: BuilderStorageProvider[]): string {
  return JSON.stringify(providers)
}

export function maskStorageProviderSecrets(providers: BuilderStorageProvider[]): BuilderStorageProvider[] {
  return providers.map((provider) => {
    const sensitiveKeys = STORAGE_PROVIDER_SENSITIVE_FIELDS[provider.type] ?? []
    const maskedConfig: Record<string, string> = { ...provider.config }

    for (const key of sensitiveKeys) {
      if (maskedConfig[key] && maskedConfig[key].length > 0) {
        maskedConfig[key] = STORAGE_PROVIDER_SECRET_PLACEHOLDER
      }
    }

    return {
      ...provider,
      config: maskedConfig,
    }
  })
}

export function mergeStorageProviderSecrets(
  incoming: BuilderStorageProvider[],
  existing: BuilderStorageProvider[],
): BuilderStorageProvider[] {
  const existingMap = new Map(existing.map((provider) => [provider.id, provider]))
  const now = new Date().toISOString()

  return incoming.map((provider) => {
    const previous = existingMap.get(provider.id)
    const sensitiveKeys = STORAGE_PROVIDER_SENSITIVE_FIELDS[provider.type] ?? []
    const mergedConfig: Record<string, string> = { ...provider.config }

    for (const key of sensitiveKeys) {
      const value = mergedConfig[key] ?? ''
      if (value === STORAGE_PROVIDER_SECRET_PLACEHOLDER) {
        mergedConfig[key] = previous?.config[key] ?? ''
        continue
      }
    }

    return {
      ...provider,
      config: mergedConfig,
      createdAt: previous?.createdAt ?? provider.createdAt ?? now,
      updatedAt: now,
    }
  })
}

export function sanitizeStorageProviders(raw: string | null): string {
  const normalized = typeof raw === 'string' ? raw.trim() : ''
  if (!normalized) {
    return '[]'
  }

  const providers = parseStorageProviders(normalized)
  const masked = maskStorageProviderSecrets(providers)
  return serializeStorageProviders(masked)
}

export function prepareStorageProvidersForPersist(
  incomingRaw: string,
  existingRaw: string | null,
): { stored: string; masked: string } {
  const incomingProviders = parseStorageProviders(incomingRaw)
  const existingProviders = parseStorageProviders(existingRaw)
  const merged = mergeStorageProviderSecrets(incomingProviders, existingProviders)
  return {
    stored: serializeStorageProviders(merged),
    masked: serializeStorageProviders(maskStorageProviderSecrets(merged)),
  }
}
