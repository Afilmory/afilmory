import { BizException, ErrorCode } from '@core/errors'

export type QuotaReason
  = | 'custom_domain'
    | 'library_items'
    | 'monthly_process'
    | 'storage'
    | 'sync_object_size'
    | 'upload_size'

export function quotaExceeded(input: {
  reason: QuotaReason
  message: string
  details: Record<string, number | null>
}): BizException {
  const code
    = input.reason === 'storage' ? ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED : ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED
  return new BizException(code, {
    message: input.message,
    details: { reason: input.reason, ...input.details },
  })
}
