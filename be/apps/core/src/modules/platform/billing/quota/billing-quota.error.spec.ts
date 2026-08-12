import { ErrorCode } from '@core/errors'
import { describe, expect, it } from 'vitest'

import { quotaExceeded } from './billing-quota.error'

describe('quotaExceeded', () => {
  it('carries the reason and numbers on the response body', () => {
    const error = quotaExceeded({
      reason: 'storage',
      message: '托管存储空间不足',
      details: { capacityBytes: 5_368_709_120, usedBytes: 5_262_002_324, incomingBytes: 188_743_680 },
    })

    expect(error.getHttpStatus()).toBe(402)
    expect(error.toResponse()).toEqual({
      ok: false,
      code: ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED,
      message: '托管存储空间不足',
      details: {
        reason: 'storage',
        capacityBytes: 5_368_709_120,
        usedBytes: 5_262_002_324,
        incomingBytes: 188_743_680,
      },
    })
  })

  it('uses the plan quota code for every non-storage dimension', () => {
    const error = quotaExceeded({
      reason: 'upload_size',
      message: '文件超出允许的单张大小',
      details: { limitMb: 25, actualMb: 41 },
    })

    expect(error.code).toBe(ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED)
    expect(error.toResponse().details).toEqual({ reason: 'upload_size', limitMb: 25, actualMb: 41 })
  })
})
