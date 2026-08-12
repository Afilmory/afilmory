import { BizException } from '@core/errors'

// A progress stream has already sent 200 by the time the handler throws, so the HTTP status can no
// longer carry the failure. Anything the client needs to react to has to travel in this payload.
export function describeStreamError(error: unknown): {
  message: string
  code?: number
  details?: Record<string, unknown>
} {
  if (error instanceof BizException) {
    return {
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    }
  }
  return { message: error instanceof Error ? error.message : '上传失败' }
}
