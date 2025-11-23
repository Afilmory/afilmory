import { Button } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import { Copy, Play, Square, Upload } from 'lucide-react'
import { m } from 'motion/react'
import { nanoid } from 'nanoid'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { getI18n } from '~/i18n'
import { getRequestErrorMessage } from '~/lib/errors'
import type { PhotoSyncLogLevel } from '~/modules/photos/types'
import type { BuilderDebugProgressEvent, BuilderDebugResult } from '~/modules/super-admin'
import { runBuilderDebugTest } from '~/modules/super-admin'

const MAX_LOG_ENTRIES = 300

const builderDebugKeys = {
  title: 'superadmin.builder-debug.title',
  description: 'superadmin.builder-debug.description',
  toasts: {
    pickFile: 'superadmin.builder-debug.toast.pick-file',
    successTitle: 'superadmin.builder-debug.toast.success.title',
    successDescription: 'superadmin.builder-debug.toast.success.description',
    cancelled: 'superadmin.builder-debug.toast.cancelled',
    failureFallback: 'superadmin.builder-debug.toast.failure-fallback',
    failureTitle: 'superadmin.builder-debug.toast.failure.title',
    manualCancelledMessage: 'superadmin.builder-debug.toast.manual-cancelled-message',
    manualCancelledLog: 'superadmin.builder-debug.toast.manual-cancelled-log',
    copySuccess: 'superadmin.builder-debug.toast.copy-success',
    copyFailureTitle: 'superadmin.builder-debug.toast.copy-failure.title',
    copyFailureDescription: 'superadmin.builder-debug.toast.copy-failure.description',
  },
  input: {
    title: 'superadmin.builder-debug.input.title',
    subtitle: 'superadmin.builder-debug.input.subtitle',
    placeholder: 'superadmin.builder-debug.input.placeholder',
    hint: 'superadmin.builder-debug.input.hint',
    max: 'superadmin.builder-debug.input.max',
    clear: 'superadmin.builder-debug.input.clear',
    fileMeta: 'superadmin.builder-debug.input.file-meta',
  },
  actions: {
    start: 'superadmin.builder-debug.actions.start',
    cancel: 'superadmin.builder-debug.actions.cancel',
  },
  notes: 'superadmin.builder-debug.notes.keep-page-open',
  recent: {
    title: 'superadmin.builder-debug.recent.title',
    file: 'superadmin.builder-debug.recent.file',
    size: 'superadmin.builder-debug.recent.size',
    storageKey: 'superadmin.builder-debug.recent.storage-key',
  },
  safety: {
    title: 'superadmin.builder-debug.safety.title',
    noDb: 'superadmin.builder-debug.safety.items.no-db',
    noStorage: 'superadmin.builder-debug.safety.items.no-storage',
    realtime: 'superadmin.builder-debug.safety.items.realtime',
  },
  logs: {
    title: 'superadmin.builder-debug.logs.title',
    subtitle: 'superadmin.builder-debug.logs.subtitle',
    source: 'superadmin.builder-debug.logs.source',
    initializing: 'superadmin.builder-debug.logs.initializing',
    empty: 'superadmin.builder-debug.logs.empty',
  },
  output: {
    title: 'superadmin.builder-debug.output.title',
    subtitle: 'superadmin.builder-debug.output.subtitle',
    copy: 'superadmin.builder-debug.output.copy',
    noManifest: 'superadmin.builder-debug.output.no-manifest',
    afterRun: 'superadmin.builder-debug.output.after-run',
  },
  summary: {
    resultType: 'superadmin.builder-debug.summary.result-type',
    storageKey: 'superadmin.builder-debug.summary.storage-key',
    thumbnail: 'superadmin.builder-debug.summary.thumbnail',
    thumbnailMissing: 'superadmin.builder-debug.summary.thumbnail-missing',
    cleaned: 'superadmin.builder-debug.summary.cleaned',
    cleanedYes: 'superadmin.builder-debug.summary.cleaned-yes',
    cleanedNo: 'superadmin.builder-debug.summary.cleaned-no',
  },
  statuses: {
    idle: 'superadmin.builder-debug.status.idle',
    running: 'superadmin.builder-debug.status.running',
    success: 'superadmin.builder-debug.status.success',
    error: 'superadmin.builder-debug.status.error',
  },
  logStatus: {
    start: 'superadmin.builder-debug.log.status.start',
    complete: 'superadmin.builder-debug.log.status.complete',
    error: 'superadmin.builder-debug.log.status.error',
  },
  logMessages: {
    start: 'superadmin.builder-debug.log.message.start',
    complete: 'superadmin.builder-debug.log.message.complete',
  },
  placeholders: {
    unknown: 'common.unknown',
  },
  logLevelPrefix: 'superadmin.builder-debug.log.level.',
} as const

const LEVEL_THEME: Record<PhotoSyncLogLevel, string> = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
}

const STATUS_LABEL: Record<RunStatus, { labelKey: I18nKeys; className: string }> = {
  idle: { labelKey: builderDebugKeys.statuses.idle, className: 'text-text-tertiary' },
  running: { labelKey: builderDebugKeys.statuses.running, className: 'text-accent' },
  success: { labelKey: builderDebugKeys.statuses.success, className: 'text-emerald-400' },
  error: { labelKey: builderDebugKeys.statuses.error, className: 'text-rose-400' },
}

type RunStatus = 'idle' | 'running' | 'success' | 'error'
type DebugStartPayload = Extract<BuilderDebugProgressEvent, { type: 'start' }>['payload']

type DebugLogEntry =
  | {
      id: string
      type: 'start' | 'complete' | 'error'
      message: string
      timestamp: number
    }
  | {
      id: string
      type: 'log'
      level: PhotoSyncLogLevel
      message: string
      timestamp: number
    }

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatTime(timestamp: number): string {
  try {
    return timeFormatter.format(timestamp)
  } catch {
    return '--:--:--'
  }
}

function formatBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function Component() {
  const { t } = useTranslation()
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-text text-2xl font-semibold">{t(builderDebugKeys.title)}</h1>
        <p className="text-text-tertiary text-sm">{t(builderDebugKeys.description)}</p>
      </header>

      <BuilderDebugConsole />
    </m.div>
  )
}

function BuilderDebugConsole() {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [logEntries, setLogEntries] = useState<DebugLogEntry[]>([])
  const [result, setResult] = useState<BuilderDebugResult | null>(null)
  const [runMeta, setRunMeta] = useState<DebugStartPayload | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const logViewportRef = useRef<HTMLDivElement>(null)

  const isRunning = runStatus === 'running'
  const manifestJson = useMemo(
    () => (result?.manifestItem ? JSON.stringify(result.manifestItem, null, 2) : null),
    [result],
  )

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!logViewportRef.current) {
      return
    }
    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight
  }, [logEntries])

  const appendLogEntry = useCallback((event: BuilderDebugProgressEvent) => {
    setLogEntries((prev) => {
      const entry = buildLogEntry(event)
      if (!entry) {
        return prev
      }
      const next = [...prev, entry]
      if (next.length > MAX_LOG_ENTRIES) {
        return next.slice(-MAX_LOG_ENTRIES)
      }
      return next
    })
  }, [])

  const handleProgressEvent = useCallback(
    (event: BuilderDebugProgressEvent) => {
      appendLogEntry(event)

      if (event.type === 'start') {
        setRunMeta(event.payload)
        setErrorMessage(null)
      }

      if (event.type === 'complete') {
        setResult(event.payload)
        setRunStatus('success')
      }

      if (event.type === 'error') {
        setErrorMessage(event.payload.message)
        setRunStatus('error')
      }
    },
    [appendLogEntry],
  )

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setSelectedFile(file)
    setResult(null)
    setErrorMessage(null)
    setRunMeta(null)
    setLogEntries([])
    setRunStatus('idle')
  }

  const handleClearFile = () => {
    setSelectedFile(null)
    setResult(null)
    setRunMeta(null)
    setLogEntries([])
    setRunStatus('idle')
    setErrorMessage(null)
  }

  const handleStart = useCallback(async () => {
    if (!selectedFile) {
      toast.info(t(builderDebugKeys.toasts.pickFile))
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setRunStatus('running')
    setErrorMessage(null)
    setResult(null)
    setLogEntries([])
    setRunMeta(null)

    try {
      const debugResult = await runBuilderDebugTest(selectedFile, {
        signal: controller.signal,
        onEvent: handleProgressEvent,
      })

      setResult(debugResult)
      setRunStatus('success')
      toast.success(t(builderDebugKeys.toasts.successTitle), {
        description: t(builderDebugKeys.toasts.successDescription),
      })
    } catch (error) {
      if (controller.signal.aborted) {
        toast.info(t(builderDebugKeys.toasts.cancelled))
        setRunStatus('idle')
      } else {
        const message = getRequestErrorMessage(error, t(builderDebugKeys.toasts.failureFallback))
        setErrorMessage(message)
        setRunStatus('error')
        toast.error(t(builderDebugKeys.toasts.failureTitle), { description: message })
      }
    } finally {
      abortControllerRef.current = null
    }
  }, [handleProgressEvent, selectedFile, t])

  const handleCancel = () => {
    if (!isRunning) {
      return
    }
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setRunStatus('idle')
    setErrorMessage(t(builderDebugKeys.toasts.manualCancelledMessage))
    setLogEntries((prev) => [
      ...prev,
      {
        id: nanoid(),
        type: 'error',
        message: t(builderDebugKeys.toasts.manualCancelledLog),
        timestamp: Date.now(),
      },
    ])
    toast.info(t(builderDebugKeys.toasts.cancelled))
  }

  const handleCopyManifest = async () => {
    if (!manifestJson) {
      return
    }

    try {
      await navigator.clipboard.writeText(manifestJson)
      toast.success(t(builderDebugKeys.toasts.copySuccess))
    } catch (error) {
      toast.error(t(builderDebugKeys.toasts.copyFailureTitle), {
        description: getRequestErrorMessage(error, t(builderDebugKeys.toasts.copyFailureDescription)),
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <LinearBorderPanel className="bg-background-tertiary/70 relative overflow-hidden rounded-xl p-6">
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text text-base font-semibold">{t(builderDebugKeys.input.title)}</p>
                  <p className="text-text-tertiary text-xs">{t(builderDebugKeys.input.subtitle)}</p>
                </div>
                <StatusBadge status={runStatus} />
              </div>

              <label
                htmlFor="builder-debug-file"
                className={clsxm(
                  'border-border/30 bg-fill/10 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition hover:border-accent/40 hover:bg-accent/5',
                  isRunning && 'pointer-events-none opacity-60',
                )}
              >
                <Upload className="mb-3 h-6 w-6 text-text" />
                <p className="text-text text-sm font-medium">
                  {selectedFile ? selectedFile.name : t(builderDebugKeys.input.placeholder)}
                </p>
                <p className="text-text-tertiary mt-1 text-xs">{t(builderDebugKeys.input.max)}</p>
              </label>
              <input
                id="builder-debug-file"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={isRunning}
              />

              {selectedFile ? (
                <div className="text-text-secondary flex items-center justify-between rounded-lg bg-background-secondary/80 px-3 py-2 text-xs">
                  <div>
                    <p className="text-text text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-text-tertiary text-xs mt-0.5">
                      {t(builderDebugKeys.input.fileMeta, {
                        size: formatBytes(selectedFile.size),
                        type: selectedFile.type || t(builderDebugKeys.placeholders.unknown),
                      })}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="xs" onClick={handleClearFile} disabled={isRunning}>
                    {t(builderDebugKeys.input.clear)}
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleStart} disabled={!selectedFile || isRunning}>
                  <Play className="mr-2 h-4 w-4" />
                  {t(builderDebugKeys.actions.start)}
                </Button>
                {isRunning ? (
                  <Button type="button" variant="ghost" onClick={handleCancel}>
                    <Square className="mr-2 h-4 w-4" />
                    {t(builderDebugKeys.actions.cancel)}
                  </Button>
                ) : null}
              </div>
              <p className="text-text-tertiary text-xs">{t(builderDebugKeys.notes)}</p>
              {errorMessage ? <p className="text-rose-400 text-xs">{errorMessage}</p> : null}
            </section>

            {runMeta ? (
              <section className="space-y-2 rounded-lg bg-background-secondary/70 px-4 py-3 text-xs">
                <p className="text-text text-sm font-semibold">{t(builderDebugKeys.recent.title)}</p>
                <div className="space-y-1">
                  <DetailRow label={t(builderDebugKeys.recent.file)}>{runMeta.filename}</DetailRow>
                  <DetailRow label={t(builderDebugKeys.recent.size)}>{formatBytes(runMeta.size)}</DetailRow>
                  <DetailRow label={t(builderDebugKeys.recent.storageKey)}>{runMeta.storageKey}</DetailRow>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg bg-fill/10 px-3 py-2 text-[11px] leading-5 text-text-tertiary">
              <p>{t(builderDebugKeys.safety.title)}</p>
              <ul className="mt-1 list-disc pl-4">
                <li>{t(builderDebugKeys.safety.noDb)}</li>
                <li>{t(builderDebugKeys.safety.noStorage)}</li>
                <li>{t(builderDebugKeys.safety.realtime)}</li>
              </ul>
            </section>
          </div>
        </LinearBorderPanel>

        <LinearBorderPanel className="bg-background-tertiary/70 relative flex min-h-[420px] flex-col rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text text-base font-semibold">{t(builderDebugKeys.logs.title)}</p>
              <p className="text-text-tertiary text-xs">
                {t(builderDebugKeys.logs.subtitle, { count: logEntries.length })}
              </p>
            </div>
            <span className="text-text-tertiary text-xs">{t(builderDebugKeys.logs.source)}</span>
          </div>

          <div
            ref={logViewportRef}
            className="border-border/20 bg-background-secondary/40 mt-4 flex-1 overflow-y-auto rounded-xl border p-3"
          >
            {logEntries.length === 0 ? (
              <div className="text-text-tertiary flex h-full items-center justify-center text-sm">
                {isRunning ? t(builderDebugKeys.logs.initializing) : t(builderDebugKeys.logs.empty)}
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {logEntries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span className="text-text-tertiary w-14 shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
                    <LogPill entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </LinearBorderPanel>
      </div>

      <LinearBorderPanel className="bg-background-tertiary/70 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-text text-base font-semibold">{t(builderDebugKeys.output.title)}</p>
            <p className="text-text-tertiary text-xs">{t(builderDebugKeys.output.subtitle)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleCopyManifest} disabled={!manifestJson}>
            <Copy className="mr-2 h-4 w-4" />
            {t(builderDebugKeys.output.copy)}
          </Button>
        </div>

        {result ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <SummaryTile label={t(builderDebugKeys.summary.resultType)} value={result.resultType.toUpperCase()} />
              <SummaryTile label={t(builderDebugKeys.summary.storageKey)} value={result.storageKey} isMono />
              <SummaryTile
                label={t(builderDebugKeys.summary.thumbnail)}
                value={result.thumbnailUrl || t(builderDebugKeys.summary.thumbnailMissing)}
                isMono
              />
              <SummaryTile
                label={t(builderDebugKeys.summary.cleaned)}
                value={
                  result.filesDeleted ? t(builderDebugKeys.summary.cleanedYes) : t(builderDebugKeys.summary.cleanedNo)
                }
              />
            </div>

            {manifestJson ? (
              <pre className="border-border/30 bg-background-secondary/70 relative max-h-[360px] overflow-auto rounded-xl border p-4 text-xs text-text">
                {manifestJson}
              </pre>
            ) : (
              <p className="text-text-tertiary text-sm">{t(builderDebugKeys.output.noManifest)}</p>
            )}
          </div>
        ) : (
          <div className="text-text-tertiary mt-4 text-sm">{t(builderDebugKeys.output.afterRun)}</div>
        )}
      </LinearBorderPanel>
    </div>
  )
}

function SummaryTile({ label, value, isMono }: { label: string; value: string; isMono?: boolean }) {
  return (
    <div className="border-border/30 bg-background-secondary/60 rounded-lg border px-3 py-2 text-xs">
      <p className="text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className={clsxm('text-text mt-1 text-sm wrap-break-word', isMono && 'font-mono text-[11px]')}>{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: RunStatus }) {
  const config = STATUS_LABEL[status]
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1 text-xs font-medium">
      <span className={clsxm('relative inline-flex h-2.5 w-2.5 items-center justify-center', config.className)}>
        <span className="bg-current inline-flex h-1.5 w-1.5 rounded-full" />
      </span>
      <span className={config.className}>{t(config.labelKey)}</span>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-text-tertiary flex gap-2">
      <span className="min-w-[72px] text-right text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-text text-xs font-mono">{children}</span>
    </div>
  )
}

function LogPill({ entry }: { entry: DebugLogEntry }) {
  const { t } = useTranslation()
  if (entry.type === 'log') {
    return (
      <div className={clsxm('min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs', LEVEL_THEME[entry.level])}>
        <p className="font-semibold uppercase tracking-wide text-[10px]">
          {t(`${builderDebugKeys.logLevelPrefix}${entry.level}`)}
        </p>
        <p className="mt-0.5 wrap-break-word text-[11px]">{entry.message}</p>
      </div>
    )
  }

  const tone =
    entry.type === 'error'
      ? 'border border-rose-500/40 bg-rose-500/10 text-rose-100'
      : entry.type === 'start'
        ? 'bg-accent/10 text-accent'
        : 'bg-emerald-500/10 text-emerald-100'
  const labelKey =
    entry.type === 'start'
      ? builderDebugKeys.logStatus.start
      : entry.type === 'complete'
        ? builderDebugKeys.logStatus.complete
        : builderDebugKeys.logStatus.error
  return (
    <div className={clsxm('min-w-0 flex-1 rounded-lg px-3 py-2 text-xs', tone)}>
      <p className="font-semibold uppercase tracking-wide text-[10px]">{t(labelKey)}</p>
      <p className="mt-0.5 wrap-break-word text-[11px]">{entry.message}</p>
    </div>
  )
}

function buildLogEntry(event: BuilderDebugProgressEvent): DebugLogEntry | null {
  const id = nanoid()
  const timestamp = Date.now()
  const i18n = getI18n()

  switch (event.type) {
    case 'start': {
      return {
        id,
        type: 'start',
        message: i18n.t(builderDebugKeys.logMessages.start, { filename: event.payload.filename }),
        timestamp,
      }
    }
    case 'complete': {
      return {
        id,
        type: 'complete',
        message: i18n.t(builderDebugKeys.logMessages.complete, { resultType: event.payload.resultType }),
        timestamp,
      }
    }
    case 'error': {
      return {
        id,
        type: 'error',
        message: event.payload.message,
        timestamp,
      }
    }
    case 'log': {
      return {
        id,
        type: 'log',
        level: event.payload.level,
        message: event.payload.message,
        timestamp: Date.parse(event.payload.timestamp) || timestamp,
      }
    }
    default: {
      return null
    }
  }
}
