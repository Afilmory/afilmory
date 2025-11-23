import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

export interface CreateProgressSseResponseOptions<TEvent> {
  context: Context
  eventName?: string
  heartbeatIntervalMs?: number
  handler: (helpers: SseHandlerHelpers<TEvent>) => Promise<void> | void
}

export interface SseHandlerHelpers<TEvent> {
  sendEvent: (event: TEvent) => Promise<void>
  sendChunk: (chunk: string) => Promise<void>
  abortSignal: AbortSignal
}

const DEFAULT_EVENT_NAME = 'progress'
const DEFAULT_HEARTBEAT_MS = 15_000

export function createProgressSseResponse<TEvent>({
  context,
  eventName = DEFAULT_EVENT_NAME,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_MS,
  handler,
}: CreateProgressSseResponseOptions<TEvent>): Response {
  context.header('Cache-Control', 'no-cache, no-transform')
  context.header('X-Accel-Buffering', 'no')

  return streamSSE(context, async (stream) => {
    const controller = new AbortController()
    const abortSignal = controller.signal

    let heartbeat: ReturnType<typeof setInterval> | undefined

    const stopHeartbeat = () => {
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }
    }

    stream.onAbort(() => {
      if (!abortSignal.aborted) {
        controller.abort()
      }
      stopHeartbeat()
    })

    const sendEvent = async (event: TEvent) => {
      await stream.writeSSE({
        event: eventName,
        data: JSON.stringify(event),
      })
    }

    const sendChunk = async (chunk: string) => {
      await stream.write(chunk)
    }

    await stream.write(': connected\n\n')

    heartbeat = setInterval(() => {
      if (abortSignal.aborted) {
        stopHeartbeat()
        return
      }

      stream.write(`: keep-alive ${new Date().toISOString()}\n\n`).catch((error) => {
        console.error('SSE heartbeat failed', error)
        stopHeartbeat()
      })
    }, heartbeatIntervalMs)

    try {
      await handler({
        sendEvent,
        sendChunk,
        abortSignal,
      })
    } catch (error) {
      console.error('SSE handler failed', error)
    } finally {
      stopHeartbeat()
      stream.close()
    }
  })
}
