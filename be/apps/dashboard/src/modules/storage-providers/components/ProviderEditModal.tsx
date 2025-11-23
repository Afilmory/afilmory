import type { ModalComponentProps } from '@afilmory/ui'
import {
  Button,
  FormHelperText,
  Input,
  Label,
  LinearDivider,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import { m } from 'motion/react'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { storageProvidersI18nKeys } from '../constants'
import type { StorageProvider, StorageProviderFormSchema, StorageProviderType } from '../types'

type ProviderEditModalProps = ModalComponentProps & {
  provider: StorageProvider | null
  activeProviderId: string | null
  providerSchema: StorageProviderFormSchema
  onSave: (provider: StorageProvider) => void
  onSetActive: (id: string) => void
}

export function ProviderEditModal({
  provider,
  providerSchema,

  onSave,

  dismiss,
}: ProviderEditModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<StorageProvider | null>(provider)
  const [isDirty, setIsDirty] = useState(false)

  // Reset form when provider changes (e.g., when modal opens with new provider)
  const providerKey = provider?.id || 'new'
  useEffect(() => {
    setFormData(provider)
    setIsDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKey])

  const isNewProvider = !provider?.id

  const selectedFields = useMemo(() => {
    if (!formData) return []
    return providerSchema.fields[formData.type] ?? []
  }, [formData, providerSchema])

  const handleNameChange = (value: string) => {
    if (!formData) return
    setFormData({ ...formData, name: value })
    setIsDirty(true)
  }

  const handleTypeChange = (value: StorageProviderType) => {
    if (!formData) return
    setFormData({
      ...formData,
      type: value,
      config: {}, // Reset config when type changes
    })
    setIsDirty(true)
  }

  const handleConfigChange = (key: string, value: string) => {
    if (!formData) return
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        [key]: value,
      },
    })
    setIsDirty(true)
  }

  const handleSave = () => {
    if (!formData) return
    formData.id = formData.id && formData.id.trim().length > 0 ? formData.id : nanoid()
    onSave(formData)
    dismiss()
  }

  if (!formData) return null

  return (
    <div className="flex h-full max-h-[85vh] flex-col">
      {/* Header */}
      <div className="relative shrink-0 space-y-3 px-6 pt-6">
        <div className="flex items-start gap-3">
          <div
            className={clsxm(
              'flex size-10 shrink-0 items-center justify-center rounded',
              isNewProvider ? 'bg-accent/10 text-accent' : 'bg-fill text-text',
            )}
          >
            <DynamicIcon name={isNewProvider ? 'plus-circle' : 'edit'} className="size-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-text text-xl font-semibold">
              {t(isNewProvider ? storageProvidersI18nKeys.modal.createTitle : storageProvidersI18nKeys.modal.editTitle)}
            </h2>
            <p className="text-text-tertiary text-sm">
              {t(
                isNewProvider
                  ? storageProvidersI18nKeys.modal.createDescription
                  : storageProvidersI18nKeys.modal.editDescription,
              )}
            </p>
          </div>
        </div>
        <LinearDivider className="absolute right-0 bottom-0 left-0" />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea rootClassName="h-full" viewportClassName="h-full">
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={Spring.presets.smooth}
            className="space-y-6 px-6 py-4"
          >
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-text text-sm font-semibold">{t(storageProvidersI18nKeys.modal.sections.basic)}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider-name">{t(storageProvidersI18nKeys.modal.fields.nameLabel)}</Label>
                  <Input
                    id="provider-name"
                    value={formData.name}
                    onInput={(e) => handleNameChange(e.currentTarget.value)}
                    placeholder={t(storageProvidersI18nKeys.modal.fields.namePlaceholder)}
                    className="bg-background/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider-type">{t(storageProvidersI18nKeys.modal.fields.typeLabel)}</Label>
                  <Select value={formData.type} onValueChange={(value) => handleTypeChange(value)}>
                    <SelectTrigger id="provider-type">
                      <SelectValue placeholder={t(storageProvidersI18nKeys.modal.fields.typePlaceholder)} />
                    </SelectTrigger>
                    <SelectContent>
                      {providerSchema.types.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Configuration Fields */}
            {selectedFields.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-text text-sm font-semibold">
                  {t(storageProvidersI18nKeys.modal.sections.connection)}
                </h3>
                <div className="space-y-4">
                  {selectedFields.map((field) => {
                    const value = formData.config[field.key] || ''
                    const placeholder = field.placeholder ?? undefined
                    return (
                      <div
                        key={field.key}
                        className="border-fill-tertiary/40 bg-background/30 space-y-2 rounded border p-4"
                      >
                        <div className="space-y-1">
                          <Label
                            htmlFor={`field-${field.key}`}
                            className="font-semibold flex items-center gap-2 text-sm"
                          >
                            <span>{field.label}</span>
                            {field.required ? (
                              <span className="text-red border-red/30 bg-red/10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                {t(storageProvidersI18nKeys.modal.fields.required)}
                              </span>
                            ) : null}
                          </Label>
                          {field.description ? <p className="text-text-tertiary text-xs">{field.description}</p> : null}
                        </div>

                        {field.multiline ? (
                          <Textarea
                            id={`field-${field.key}`}
                            value={value}
                            onInput={(e) => handleConfigChange(field.key, e.currentTarget.value)}
                            placeholder={placeholder}
                            rows={3}
                            className="bg-background/60"
                            required={field.required}
                            aria-required={field.required || undefined}
                          />
                        ) : (
                          <Input
                            id={`field-${field.key}`}
                            type={field.sensitive ? 'password' : 'text'}
                            value={value}
                            onInput={(e) => handleConfigChange(field.key, e.currentTarget.value)}
                            placeholder={placeholder}
                            className="bg-background/60"
                            autoComplete="off"
                            required={field.required}
                            aria-required={field.required || undefined}
                          />
                        )}

                        {field.helperText ? <FormHelperText>{field.helperText}</FormHelperText> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </m.div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="relative shrink-0 px-6 pt-4 pb-6">
        <LinearDivider className="absolute top-0 right-0 left-0" />
        {isNewProvider ? (
          // Add mode: Simple cancel + create actions
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              onClick={dismiss}
              variant="ghost"
              size="sm"
              className="text-text-secondary hover:text-text"
            >
              {t(storageProvidersI18nKeys.actions.cancel)}
            </Button>
            <Button type="button" onClick={handleSave} variant="primary" size="sm">
              <DynamicIcon name="plus" className="mr-2 h-3.5 w-3.5" />
              <span>{t(storageProvidersI18nKeys.actions.create)}</span>
            </Button>
          </div>
        ) : (
          // Edit mode: Delete + cancel + set active + save
          <div className="flex items-center justify-end gap-3">
            <Button type="button" onClick={handleSave} disabled={!isDirty} variant="primary" size="sm">
              <DynamicIcon name="save" className="mr-2 h-3.5 w-3.5" />
              <span>{t(storageProvidersI18nKeys.actions.save)}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Configure modal content
ProviderEditModal.contentClassName = 'max-w-2xl w-[95vw] max-h-[90vh] p-0'
ProviderEditModal.contentProps = {
  style: {
    maxHeight: '90vh',
  },
}
