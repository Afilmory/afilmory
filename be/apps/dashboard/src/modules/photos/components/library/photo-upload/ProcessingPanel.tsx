import { ScrollArea } from '@afilmory/ui'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { STAGE_CONFIG, STAGE_ORDER, SUMMARY_FIELDS } from './constants'
import type { ProcessingLogEntry, ProcessingState } from './types'

type ProcessingPanelProps = {
  state: ProcessingState | null
  logs: ProcessingLogEntry[]
}

const LOG_LEVEL_CONFIG: Record<ProcessingLogEntry['level'], { label: string; className: string }> = {
  info: { label: 'INFO', className: 'text-slate-300' },
  success: { label: 'OK', className: 'text-emerald-300' },
  warn: { label: 'WARN', className: 'text-amber-300' },
  error: { label: 'ERR', className: 'text-rose-300' },
}

const formatTimestamp = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp)
  } catch {
    return new Date(timestamp).toLocaleTimeString('zh-CN')
  }
}

export function ProcessingPanel({ state, logs }: ProcessingPanelProps) {
  if (!state) {
    return (
      <LinearBorderPanel className="bg-background/40 px-3 py-4 text-center text-xs text-text-tertiary">
        正在等待服务器处理开始...
      </LinearBorderPanel>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 mt-4">
        {STAGE_ORDER.map((stage) => {
          const stageState = state.stages[stage]
          const ratio = stageState.total === 0 ? 1 : Math.min(1, stageState.processed / stageState.total)
          const config = STAGE_CONFIG[stage]
          return (
            <LinearBorderPanel key={stage} className="bg-fill/10 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text font-medium">{config.label}</span>
                <span className="text-text-tertiary">
                  {stageState.status === 'completed'
                    ? '已完成'
                    : stageState.total === 0
                      ? '无需处理'
                      : `${stageState.processed} / ${stageState.total}`}
                </span>
              </div>
              <div className="bg-fill/20 mt-2 h-1.5 rounded-full">
                <div className="bg-accent h-full rounded-full" style={{ width: `${ratio * 100}%` }} />
              </div>
              <p className="text-text-tertiary mt-1 text-[11px]">{config.description}</p>
            </LinearBorderPanel>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SUMMARY_FIELDS.map((field) => (
          <LinearBorderPanel key={field.key} className="bg-background/40 px-3 py-2 text-xs">
            <p className="text-text-tertiary uppercase tracking-wide">{field.label}</p>
            <p className="text-text mt-1 text-lg font-semibold">{state.summary[field.key]}</p>
          </LinearBorderPanel>
        ))}
      </div>

      <LinearBorderPanel className="bg-background/50 px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text font-medium">服务器日志</span>
          <span className="text-text-tertiary">{logs.length} 条</span>
        </div>
        <ScrollArea rootClassName="mt-2 h-36 -mx-3 px-3">
          {logs.length === 0 ? (
            <p className="text-text-tertiary text-xs">等待日志输出...</p>
          ) : (
            <ul className="space-y-1.5 text-xs font-mono flex flex-col-reverse">
              {logs.map((log) => {
                const levelConfig = LOG_LEVEL_CONFIG[log.level]
                return (
                  <li key={log.id} className="flex items-start gap-2">
                    <span className="text-text-tertiary text-[10px] leading-5">{formatTimestamp(log.timestamp)}</span>
                    <span className={`${levelConfig.className} text-[10px] font-semibold leading-5`}>
                      {levelConfig.label}
                    </span>
                    <span className="text-text leading-5 break-words">{log.message}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </LinearBorderPanel>
    </div>
  )
}
