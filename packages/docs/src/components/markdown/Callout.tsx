import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import * as React from 'react'

type CalloutType = 'info' | 'warning' | 'error' | 'success'

interface CalloutProps {
  type?: CalloutType
  children: React.ReactNode
  className?: string
}

const typeStyles: Record<CalloutType, string> = {
  info: 'bg-blue-50/80 border border-blue-200/60 text-blue-900 backdrop-blur-sm',
  warning: 'bg-amber-50/80 border border-amber-200/60 text-amber-900 backdrop-blur-sm',
  error: 'bg-red-50/80 border border-red-200/60 text-red-900 backdrop-blur-sm',
  success: 'bg-green-50/80 border border-green-200/60 text-green-900 backdrop-blur-sm',
}

const iconColors: Record<CalloutType, string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  success: 'text-green-500',
}

const typeIcons: Record<CalloutType, React.ReactNode> = {
  info: <Info className="h-6 w-6" />,
  warning: <AlertTriangle className="h-6 w-6" />,
  error: <AlertCircle className="h-6 w-6" />,
  success: <CheckCircle className="h-6 w-6" />,
}

export function Callout({ type = 'info', children, className = '' }: CalloutProps) {
  return (
    <div
      className={`
        flex items-start gap-4 
        rounded-2xl px-6 py-4 my-6
        shadow-sm shadow-black/5
        ${typeStyles[type]} 
        ${className}
        transition-all duration-200 ease-out
        border-0
      `
        .replaceAll(/\s+/g, ' ')
        .trim()}
      role="alert"
    >
      <div className="min-w-0 flex-1 pt-5 ">
        <div
          className="inline-flex justify-start gap-5 text-sm leading-relaxed font-medium *:m-0"
          style={{ lineHeight: '1.25rem' }}
        >
          {' '}
          <span className={`flex-shrink-0 ${iconColors[type]} flex items-center`} style={{ height: '1.25rem' }}>
            {typeIcons[type]}
          </span>
          {children}
        </div>
      </div>
    </div>
  )
}
