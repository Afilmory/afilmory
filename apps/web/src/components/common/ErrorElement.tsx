import { Button } from '@afilmory/ui'
import { repository } from '@pkg'
import { useEffect, useRef } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { attachOpenInEditor } from '~/lib/dev'

export function ErrorElement() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : JSON.stringify(error)
  const stack = error instanceof Error ? error.stack : null

  useEffect(() => {
    console.error('Error handled by React Router default ErrorBoundary:', error)
  }, [error])

  const reloadRef = useRef(false)
  if (
    message.startsWith('Failed to fetch dynamically imported module') &&
    window.sessionStorage.getItem('reload') !== '1'
  ) {
    if (reloadRef.current) return null
    window.sessionStorage.setItem('reload', '1')
    window.location.reload()
    reloadRef.current = true
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header spacer */}
      <div className="h-16" />

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg">
          {/* Error icon and status */}
          <div className="mb-8 text-center">
            <div className="bg-background-secondary mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full">
              <svg className="text-red h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <h1 className="text-text mb-2 text-3xl font-medium">Something went wrong</h1>
            <p className="text-text-secondary text-lg">We encountered an unexpected error</p>
          </div>

          {/* Error message */}
          <div className="bg-material-medium border-fill-tertiary mb-6 rounded-lg border p-4">
            <p className="text-text-secondary font-mono text-sm break-words">{message}</p>
          </div>

          {/* Stack trace in development */}
          {import.meta.env.DEV && stack && (
            <div className="mb-6">
              <div className="bg-material-medium border-fill-tertiary overflow-auto rounded-lg border p-4">
                <pre className="text-red font-mono text-xs break-words whitespace-pre-wrap">
                  {attachOpenInEditor(stack)}
                </pre>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => (window.location.href = '/')}
              className="bg-material-opaque text-text-vibrant hover:bg-control-enabled/90 h-10 flex-1 border-0 font-medium transition-colors"
            >
              Reload Application
            </Button>
            <Button
              onClick={() => window.history.back()}
              className="bg-material-thin text-text border-fill-tertiary hover:bg-fill-tertiary h-10 flex-1 border font-medium transition-colors"
            >
              Go Back
            </Button>
          </div>

          {/* Help text */}
          <div className="text-center">
            <p className="text-text-secondary mb-3 text-sm">If this problem persists, please report it to our team.</p>
            <a
              href={`${repository.url}/issues/new?title=${encodeURIComponent(
                `Error: ${message}`,
              )}&body=${encodeURIComponent(
                `### Error\n\n${message}\n\n### Stack\n\n\`\`\`\n${stack}\n\`\`\``,
              )}&label=bug`}
              target="_blank"
              rel="noreferrer"
              className="text-text-secondary hover:text-text inline-flex items-center text-sm transition-colors"
            >
              <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              Report on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
