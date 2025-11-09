import { coreApi, coreApiBaseURL } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type {
  PhotoAssetListItem,
  PhotoAssetSummary,
  PhotoSyncAction,
  PhotoSyncConflict,
  PhotoSyncProgressEvent,
  PhotoSyncResolution,
  PhotoSyncResult,
  RunPhotoSyncPayload,
} from './types'

const STABLE_NEWLINE = /\r?\n/

type RunPhotoSyncOptions = {
  signal?: AbortSignal
  onEvent?: (event: PhotoSyncProgressEvent) => void
}

export async function runPhotoSync(
  payload: RunPhotoSyncPayload,
  options?: RunPhotoSyncOptions,
): Promise<PhotoSyncResult> {
  const response = await fetch(`${coreApiBaseURL}/data-sync/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    credentials: 'include',
    body: JSON.stringify({ dryRun: payload.dryRun ?? false }),
    signal: options?.signal,
  })

  if (!response.ok || !response.body) {
    const message = `同步请求失败：${response.status} ${response.statusText}`
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalResult: PhotoSyncResult | null = null
  let lastErrorMessage: string | null = null

  const stageEvent = (rawEvent: string) => {
    const lines = rawEvent.split(STABLE_NEWLINE)
    let eventName: string | null = null
    const dataLines: string[] = []

    for (const line of lines) {
      if (!line) {
        continue
      }

      if (line.startsWith(':')) {
        continue
      }

      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (!eventName || dataLines.length === 0) {
      return
    }

    if (eventName !== 'progress') {
      return
    }

    const data = dataLines.join('\n')

    try {
      const parsed = JSON.parse(data)
      const event = camelCaseKeys<PhotoSyncProgressEvent>(parsed)

      options?.onEvent?.(event)

      if (event.type === 'complete') {
        finalResult = event.payload
      }

      if (event.type === 'error') {
        lastErrorMessage = event.payload.message
      }
    } catch (error) {
      console.error('Failed to parse sync progress event', error)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        stageEvent(rawEvent)
        boundary = buffer.indexOf('\n\n')
      }
    }

    if (buffer.trim().length > 0) {
      stageEvent(buffer)
      buffer = ''
    }
  } finally {
    reader.releaseLock()
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage)
  }

  if (!finalResult) {
    throw new Error('同步过程中未收到最终结果，连接已终止。')
  }

  return camelCaseKeys<PhotoSyncResult>(finalResult)
}

export async function listPhotoSyncConflicts(): Promise<PhotoSyncConflict[]> {
  const conflicts = await coreApi<PhotoSyncConflict[]>('/data-sync/conflicts')
  return camelCaseKeys<PhotoSyncConflict[]>(conflicts)
}

export async function resolvePhotoSyncConflict(
  id: string,
  payload: { strategy: PhotoSyncResolution; dryRun?: boolean },
): Promise<PhotoSyncAction> {
  const result = await coreApi<PhotoSyncAction>(`/data-sync/conflicts/${id}/resolve`, {
    method: 'POST',
    body: payload,
  })

  return camelCaseKeys<PhotoSyncAction>(result)
}

export async function listPhotoAssets(): Promise<PhotoAssetListItem[]> {
  const assets = await coreApi<PhotoAssetListItem[]>('/photos/assets')

  return camelCaseKeys<PhotoAssetListItem[]>(assets)
}

export async function getPhotoAssetSummary(): Promise<PhotoAssetSummary> {
  const summary = await coreApi<PhotoAssetSummary>('/photos/assets/summary')

  return camelCaseKeys<PhotoAssetSummary>(summary)
}

export async function deletePhotoAssets(ids: string[]): Promise<void> {
  await coreApi('/photos/assets', {
    method: 'DELETE',
    body: { ids },
  })
}

export async function uploadPhotoAssets(
  files: File[],
  options?: { directory?: string },
): Promise<PhotoAssetListItem[]> {
  const formData = new FormData()

  if (options?.directory) {
    formData.append('directory', options.directory)
  }

  for (const file of files) {
    formData.append('files', file)
  }

  const response = await coreApi<{ assets: PhotoAssetListItem[] }>('/photos/assets/upload', {
    method: 'POST',
    body: formData,
  })

  const data = camelCaseKeys<{ assets: PhotoAssetListItem[] }>(response)

  return data.assets
}

export async function getPhotoStorageUrl(storageKey: string): Promise<string> {
  const result = await coreApi<{ url: string }>('/photos/storage-url', {
    method: 'GET',
    query: { key: storageKey },
  })

  const data = camelCaseKeys<{ url: string }>(result)

  return data.url
}
