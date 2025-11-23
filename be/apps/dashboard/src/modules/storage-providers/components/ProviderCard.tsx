import { Button } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { storageProvidersI18nKeys } from '../constants'
import type { StorageProvider } from '../types'

const providerTypeConfig: Record<
  string,
  {
    icon: string
    color: string
    bgColor: string
  }
> = {
  s3: {
    icon: 'database',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  b2: {
    icon: 'cloud',
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
  },
  github: {
    icon: 'github',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  local: {
    icon: 'folder',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  minio: {
    icon: 'server',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  eagle: {
    icon: 'image',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
}

type ProviderCardProps = {
  provider: StorageProvider
  isActive: boolean
  onEdit: () => void
  onToggleActive: () => void
  typeLabel?: string
}

export const ProviderCard: FC<ProviderCardProps> = ({ provider, isActive, onEdit, onToggleActive, typeLabel }) => {
  const { t } = useTranslation()
  const config = providerTypeConfig[provider.type] ?? providerTypeConfig.s3
  const knownTypeKey = storageProvidersI18nKeys.types[provider.type as keyof typeof storageProvidersI18nKeys.types]
  const resolvedTypeLabel = typeLabel ?? (knownTypeKey ? t(knownTypeKey) : provider.type)

  // Extract preview info based on provider type
  const getPreviewInfo = () => {
    const cfg = provider.config
    switch (provider.type) {
      case 's3': {
        return cfg.region || cfg.bucket || t(storageProvidersI18nKeys.card.notConfigured)
      }
      case 'github': {
        return cfg.repo || t(storageProvidersI18nKeys.card.notConfigured)
      }
      case 'b2': {
        return cfg.bucketName || cfg.bucketId || t(storageProvidersI18nKeys.card.notConfigured)
      }

      default: {
        return t(storageProvidersI18nKeys.card.fallback)
      }
    }
  }

  return (
    <div
      className={clsxm(
        'group relative flex size-full flex-col gap-3 overflow-hidden bg-background-tertiary p-5 text-left transition-all duration-200',
        'hover:shadow-lg',
      )}
    >
      {/* Linear gradient borders */}
      <div className="via-text/20 group-hover:via-accent/40 absolute top-0 right-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent transition-opacity" />
      <div className="via-text/20 group-hover:via-accent/40 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent transition-opacity" />
      <div className="via-text/20 group-hover:via-accent/40 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent transition-opacity" />
      <div className="via-text/20 group-hover:via-accent/40 absolute top-0 bottom-0 left-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent transition-opacity" />

      {/* Active Badge */}
      {isActive && (
        <div className="absolute top-3 right-3">
          <span className="bg-accent inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            <DynamicIcon name="check-circle" className="h-3 w-3" />
            {t(storageProvidersI18nKeys.card.active)}
          </span>
        </div>
      )}

      {/* Provider Icon */}
      <div className="relative">
        <div className={clsxm('inline-flex h-12 w-12 items-center justify-center rounded-lg', config.bgColor)}>
          <DynamicIcon name={config.icon as any} className={clsxm('h-6 w-6', config.color)} />
        </div>
      </div>

      {/* Provider Info */}
      <div className="relative flex-1 space-y-1">
        <h3 className="text-text text-sm font-semibold">
          {provider.name || t(storageProvidersI18nKeys.card.untitled)}
        </h3>
        <p className="text-text-tertiary text-xs font-medium">{resolvedTypeLabel}</p>
        <p className="text-text-tertiary/70 truncate text-xs">{getPreviewInfo()}</p>
      </div>

      {/* Actions - bottom right */}
      <div className="flex items-center -mb-3 gap-0.5 justify-end -mt-2 -mr-3.5">
        {isActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-text-secondary hover:text-text"
            onClick={onToggleActive}
          >
            <DynamicIcon name="x-circle" className="mr-1 h-3.5 w-3.5" />
            <span>{t(storageProvidersI18nKeys.card.makeInactive)}</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 border"
            onClick={onToggleActive}
          >
            <DynamicIcon name="check" className="h-3.5 w-3.5 mr-1" />
            <span>{t(storageProvidersI18nKeys.card.makeActive)}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <DynamicIcon name="pencil" className="mr-1 h-3.5 w-3.5" />
          <span>{t(storageProvidersI18nKeys.card.edit)}</span>
        </Button>
      </div>
    </div>
  )
}
