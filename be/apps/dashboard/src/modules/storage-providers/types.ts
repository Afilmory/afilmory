export type StorageProviderType = 's3' | 'github'

export interface StorageProvider {
  id: string
  name: string
  type: StorageProviderType
  config: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

export interface StorageProvidersPayload {
  providers: StorageProvider[]
  activeProviderId: string | null
}

export interface StorageProviderFieldDefinition {
  key: string
  label: string
  placeholder?: string
  description?: string
  helper?: string
  multiline?: boolean
  sensitive?: boolean
}
