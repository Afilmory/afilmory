import { useSyncExternalStore } from 'react'

import type { PageDefinition, PageDefinitionBase, PagePresentationOptions } from './page'

export type PresentationResult<TResult> = { status: 'cancelled' } | { status: 'completed', value: TResult }

type PresentArgs<TParams> = [TParams] extends [undefined]
  ? [params?: TParams, options?: Partial<PagePresentationOptions>]
  : [params: TParams, options?: Partial<PagePresentationOptions>]

export interface PresentationSession {
  id: number
  page: PageDefinitionBase
  params: unknown
  presentation: PagePresentationOptions
  visible: boolean
}

interface StoredPresentationSession extends PresentationSession {
  pendingResult?: PresentationResult<unknown>
  resolve: (result: PresentationResult<unknown>) => void
}

let nextId = 1
let sessions: readonly StoredPresentationSession[] = []
let publicSessions: readonly PresentationSession[] = []
const listeners = new Set<() => void>()

function emit() {
  publicSessions = sessions.map(({ id, page, params, presentation, visible }) => ({
    id,
    page,
    params,
    presentation,
    visible,
  }))
  for (const listener of listeners) {
    listener()
  }
}

function settle(id: number, result: PresentationResult<unknown>) {
  const session = sessions.find(candidate => candidate.id === id)
  if (!session || !session.visible) {
    return
  }

  if (!session.presentation.detents) {
    sessions = sessions.map(candidate =>
      candidate.id === id ? { ...candidate, pendingResult: result, visible: false } : candidate)
    emit()
    return
  }

  sessions = sessions.filter(candidate => candidate.id !== id)
  emit()
  session.resolve(result)
}

export function present<TParams, TResult>(
  page: PageDefinition<TParams, TResult>,
  ...args: PresentArgs<TParams>
): Promise<PresentationResult<TResult>> {
  const [params, presentation] = args
  const id = nextId++

  return new Promise<PresentationResult<TResult>>((resolve) => {
    sessions = [
      ...sessions,
      {
        id,
        page,
        params,
        presentation: { ...page.presentation, ...presentation },
        resolve: result => resolve(result as PresentationResult<TResult>),
        visible: true,
      },
    ]
    emit()
  })
}

export type PresentPage = typeof present

export function completePresentation(id: number, value: unknown): void {
  settle(id, { status: 'completed', value })
}

export function cancelPresentation(id: number): void {
  settle(id, { status: 'cancelled' })
}

export function finalizePresentation(id: number): void {
  const session = sessions.find(candidate => candidate.id === id)
  if (!session) {
    return
  }

  sessions = sessions.filter(candidate => candidate.id !== id)
  emit()
  session.resolve(session.pendingResult ?? { status: 'cancelled' })
}

export function getPresentationSnapshot(): readonly PresentationSession[] {
  return publicSessions
}

export function subscribeToPresentations(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePresentationSessions(): readonly PresentationSession[] {
  return useSyncExternalStore(subscribeToPresentations, getPresentationSnapshot, getPresentationSnapshot)
}
