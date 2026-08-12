import { BizException, ErrorCode } from '@core/errors'
import { describe, expect, it } from 'vitest'

import { describeStreamError } from './sse-error'

describe('describeStreamError', () => {
  it('forwards the code and details of a business exception', () => {
    const error = new BizException(ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED, {
      message: '托管存储空间不足',
      details: { reason: 'storage', capacityBytes: 100 },
    })

    expect(describeStreamError(error)).toEqual({
      message: '托管存储空间不足',
      code: ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED,
      details: { reason: 'storage', capacityBytes: 100 },
    })
  })

  it('reduces an unknown failure to its message', () => {
    expect(describeStreamError(new Error('boom'))).toEqual({ message: 'boom' })
    expect(describeStreamError('nope')).toEqual({ message: '上传失败' })
  })
})
