import type { ErrorCode, ErrorDescriptor } from './error-codes'
import { ERROR_CODE_DESCRIPTORS } from './error-codes'

export interface BizExceptionOptions {
  message?: string
  cause?: unknown
  details?: Record<string, unknown>
}

export interface BizErrorResponse {
  ok: boolean
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class BizException extends Error {
  readonly code: ErrorCode

  private readonly httpStatus: number

  readonly message: string

  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, options?: BizExceptionOptions) {
    const descriptor: ErrorDescriptor = ERROR_CODE_DESCRIPTORS[code]
    super(options?.message ?? descriptor.message, options?.cause ? { cause: options.cause } : undefined)
    this.name = 'BizException'
    this.code = code
    this.httpStatus = descriptor.httpStatus
    this.message = options?.message ?? descriptor.message
    this.details = options?.details
  }

  getHttpStatus(): number {
    return this.httpStatus
  }

  toResponse(): BizErrorResponse {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    }
  }
}
