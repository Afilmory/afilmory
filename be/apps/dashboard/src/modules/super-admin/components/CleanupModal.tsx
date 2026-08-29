import type { ModalComponent } from '@afilmory/ui'
import { Button, Checkbox, DialogDescription, DialogHeader, DialogTitle, Input, Prompt } from '@afilmory/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PageTabs } from '~/components/navigation/PageTabs'

import { useCleanupCandidatesQuery, useExecuteCleanupMutation } from '../hooks'
import type { CleanupCriteria, CleanupMode, CleanupSubjectType } from '../types'
import { CleanupPendingList } from './CleanupPendingList'

const DEFAULT_CRITERIA: CleanupCriteria = {
  inactiveMonths: 3,
  maxPhotos: 0,
  maxStorageMb: 0,
  onlyReported: false,
  minSuspendedDays: 14,
}

type Tab = CleanupSubjectType | 'pending'

export const CleanupModal: ModalComponent = ({ dismiss }) => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('tenant')
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const subjectType = tab === 'pending' ? 'tenant' : tab
  const query = useCleanupCandidatesQuery(subjectType, criteria, tab !== 'pending')
  const execute = useExecuteCleanupMutation()
  const data = query.data
  const candidates = data?.candidates ?? []
  const selectedIds = candidates.filter(item => selected.has(item.id)).map(item => item.id)

  const patchCriteria = (patch: Partial<CleanupCriteria>) => {
    setCriteria(current => ({ ...current, ...patch }))
    setSelected(new Set())
  }

  const run = (mode: CleanupMode) => {
    if (selectedIds.length === 0) {
      return
    }
    const confirmation = `${mode === 'suspend' ? 'SUSPEND' : 'DELETE'} ${selectedIds.length} ${
      subjectType === 'tenant' ? 'TENANTS' : 'USERS'
    }`
    Prompt.input({
      title: t(mode === 'suspend' ? 'superadmin.cleanup.confirm-suspend-title' : 'superadmin.cleanup.confirm-title'),
      description: t('superadmin.cleanup.confirm-description', { confirmation }),
      placeholder: confirmation,
      variant: 'danger',
      onConfirm: async (input) => {
        if (input.trim() !== confirmation) {
          toast.error(t('superadmin.cleanup.confirm-mismatch'))
          return
        }
        const result = await execute.mutateAsync({ subjectType, mode, criteria, ids: selectedIds, confirmation })
        toast.success(t('superadmin.cleanup.complete', { ...result }))
        setSelected(new Set())
        dismiss()
      },
    })
  }

  return (
    <div className="flex max-h-[80vh] flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('superadmin.cleanup.title')}</DialogTitle>
        <DialogDescription>
          {t('superadmin.cleanup.description', { days: criteria.minSuspendedDays })}
        </DialogDescription>
      </DialogHeader>

      <PageTabs
        items={[
          { id: 'tenant', label: t('superadmin.cleanup.tab-tenants') },
          { id: 'user', label: t('superadmin.cleanup.tab-users') },
          { id: 'pending', label: t('superadmin.cleanup.tab-pending') },
        ]}
        activeId={tab}
        onSelect={(next) => {
          setTab(next as Tab)
          setSelected(new Set())
        }}
      />

      {tab === 'pending' ? (
        <CleanupPendingList enabled />
      ) : (
        <>
          <div className="border-border/40 flex flex-wrap items-end gap-4 border p-3">
            <NumberField
              label={t('superadmin.cleanup.inactive-months')}
              value={criteria.inactiveMonths}
              min={1}
              max={24}
              onChange={inactiveMonths => patchCriteria({ inactiveMonths })}
            />
            <NumberField
              label={t('superadmin.cleanup.max-photos')}
              value={criteria.maxPhotos}
              min={0}
              max={1000}
              onChange={maxPhotos => patchCriteria({ maxPhotos })}
            />
            <NumberField
              label={t('superadmin.cleanup.max-storage-mb')}
              value={criteria.maxStorageMb}
              min={0}
              max={100_000}
              onChange={maxStorageMb => patchCriteria({ maxStorageMb })}
            />
            <NumberField
              label={t('superadmin.cleanup.min-suspended-days')}
              value={criteria.minSuspendedDays}
              min={1}
              max={365}
              onChange={minSuspendedDays => patchCriteria({ minSuspendedDays })}
            />
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={criteria.onlyReported}
                onCheckedChange={checked => patchCriteria({ onlyReported: checked === true })}
              />
              {t('superadmin.cleanup.only-reported')}
            </label>
          </div>

          {query.isLoading ? <p className="text-text-secondary text-sm">{t('superadmin.cleanup.loading')}</p> : null}
          {query.isError ? <p className="text-red text-sm">{t('superadmin.cleanup.error')}</p> : null}

          {data ? (
            <div className="border-border/40 min-h-0 flex-1 overflow-auto border">
              <table className="divide-border/40 min-w-full divide-y text-sm">
                <thead className="bg-background-secondary sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={selectedIds.length > 0 && selectedIds.length === candidates.length}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < candidates.length}
                        onCheckedChange={checked =>
                          setSelected(checked === true ? new Set(candidates.map(item => item.id)) : new Set())}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">{t('superadmin.cleanup.subject')}</th>
                    <th className="px-3 py-2 text-left">
                      {subjectType === 'tenant' ? t('superadmin.cleanup.owner') : t('superadmin.cleanup.workspaces')}
                    </th>
                    <th className="px-3 py-2 text-right">{t('superadmin.cleanup.content')}</th>
                    <th className="px-3 py-2 text-left">{t('superadmin.cleanup.last-active')}</th>
                  </tr>
                </thead>
                <tbody className="divide-border/20 divide-y">
                  {candidates.map(candidate => (
                    <tr key={candidate.id}>
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.has(candidate.id)}
                          onCheckedChange={checked =>
                            setSelected((current) => {
                              const next = new Set(current)
                              if (checked === true) {
                                next.add(candidate.id)
                              }
                              else {
                                next.delete(candidate.id)
                              }
                              return next
                            })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{candidate.label}</div>
                        <div className="text-text-tertiary text-xs">{candidate.secondaryLabel}</div>
                      </td>
                      <td className="px-3 py-3">
                        {candidate.subjectType === 'tenant' ? (
                          <>
                            <div>{candidate.ownerName ?? '—'}</div>
                            <div className="text-text-tertiary text-xs">{candidate.ownerEmail ?? '—'}</div>
                          </>
                        ) : (
                          <div className="tabular-nums">
                            {t('superadmin.cleanup.workspace-count', { count: candidate.workspaceCount ?? 0 })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div>{t('superadmin.cleanup.photo-count', { count: candidate.photoCount })}</div>
                        <div className="text-text-tertiary text-xs">
                          {formatBytes(candidate.storageBytes)}
                          {candidate.reportCount > 0
                            ? ` · ${t('superadmin.cleanup.report-count', { count: candidate.reportCount })}`
                            : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3">{new Date(candidate.lastActivityAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {candidates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-text-secondary px-3 py-10 text-center">
                        {t('superadmin.cleanup.empty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <span className="text-text-tertiary text-xs">
              {t('superadmin.cleanup.cutoff')}
              {': '}
              {data ? new Date(data.cutoff).toLocaleDateString() : '—'}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={dismiss}>
                {t('superadmin.cleanup.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={selectedIds.length === 0 || execute.isPending}
                onClick={() => run('delete')}
              >
                {t('superadmin.cleanup.execute-delete', { count: selectedIds.length })}
              </Button>
              <Button disabled={selectedIds.length === 0 || execute.isPending} onClick={() => run('suspend')}>
                {t('superadmin.cleanup.execute-suspend', { count: selectedIds.length })}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

CleanupModal.contentClassName = 'max-w-6xl w-[94vw]'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

function formatBytes(bytes: number) {
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`
  }
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`
  }
  if (bytes >= KB) {
    return `${Math.round(bytes / KB)} KB`
  }
  return `${bytes} B`
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-text-tertiary">{label}</span>
      <Input
        type="number"
        className="w-28"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) {
            onChange(Math.min(max, Math.max(min, Math.trunc(next))))
          }
        }}
      />
    </label>
  )
}
