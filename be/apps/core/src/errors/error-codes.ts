export enum ErrorCode {
  // Common
  COMMON_VALIDATION = 1,
  COMMON_BAD_REQUEST = 2,
  COMMON_NOT_FOUND = 3,
  COMMON_CONFLICT = 4,
  COMMON_RATE_LIMITED = 5,
  COMMON_INTERNAL_SERVER_ERROR = 6,
  COMMON_FORBIDDEN = 7,

  // Auth
  AUTH_UNAUTHORIZED = 10,
  AUTH_FORBIDDEN = 11,
  AUTH_TENANT_NOT_FOUND = 12,
  AUTH_TENANT_NOT_FOUND_GUARD = 13,

  // Tenant
  TENANT_NOT_FOUND = 20,
  TENANT_SUSPENDED = 21,
  TENANT_INACTIVE = 22,
  TENANT_SLUG_RESERVED = 23,
  TENANT_BANNED = 24,

  // Image Processing
  IMAGE_PROCESSING_FAILED = 30,
  PHOTO_MANIFEST_GENERATION_FAILED = 31,

  // Billing / Subscription
  BILLING_PLAN_QUOTA_EXCEEDED = 40,
  BILLING_STORAGE_QUOTA_EXCEEDED = 41,
  BILLING_TRANSACTION_NOT_ATTRIBUTABLE = 42,
}

export interface ErrorDescriptor {
  httpStatus: number
  message: string
}

export const ERROR_CODE_DESCRIPTORS: Record<ErrorCode, ErrorDescriptor> = {
  [ErrorCode.COMMON_VALIDATION]: {
    httpStatus: 422,
    message: 'Validation failed',
  },
  [ErrorCode.COMMON_BAD_REQUEST]: {
    httpStatus: 400,
    message: 'Bad request',
  },
  [ErrorCode.COMMON_NOT_FOUND]: {
    httpStatus: 404,
    message: 'Resource not found',
  },
  [ErrorCode.COMMON_CONFLICT]: {
    httpStatus: 409,
    message: 'Resource conflict',
  },
  [ErrorCode.COMMON_RATE_LIMITED]: {
    httpStatus: 429,
    message: 'Too many requests',
  },
  [ErrorCode.COMMON_INTERNAL_SERVER_ERROR]: {
    httpStatus: 500,
    message: 'Internal server error',
  },
  [ErrorCode.COMMON_FORBIDDEN]: {
    httpStatus: 403,
    message: 'Forbidden',
  },
  [ErrorCode.AUTH_UNAUTHORIZED]: {
    httpStatus: 401,
    message: 'Unauthorized',
  },
  [ErrorCode.AUTH_FORBIDDEN]: {
    httpStatus: 403,
    message: 'Forbidden',
  },
  [ErrorCode.AUTH_TENANT_NOT_FOUND]: {
    httpStatus: 400,
    message: 'Tenant context not found',
  },
  [ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD]: {
    httpStatus: 400,
    message: 'Tenant context not found (guard)',
  },
  [ErrorCode.TENANT_NOT_FOUND]: {
    httpStatus: 404,
    message: 'Tenant not found',
  },
  [ErrorCode.TENANT_SUSPENDED]: {
    httpStatus: 403,
    message: 'Tenant is suspended',
  },
  [ErrorCode.TENANT_INACTIVE]: {
    httpStatus: 403,
    message: 'Tenant is not active',
  },
  [ErrorCode.TENANT_SLUG_RESERVED]: {
    httpStatus: 400,
    message: 'Tenant slug is reserved',
  },
  [ErrorCode.TENANT_BANNED]: {
    httpStatus: 403,
    message: 'Tenant has been banned',
  },

  [ErrorCode.IMAGE_PROCESSING_FAILED]: {
    httpStatus: 500,
    message: 'Image processing failed',
  },
  [ErrorCode.PHOTO_MANIFEST_GENERATION_FAILED]: {
    httpStatus: 500,
    message: 'Photo manifest generation failed',
  },
  [ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED]: {
    httpStatus: 402,
    message: 'Usage quota exceeded',
  },
  [ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED]: {
    httpStatus: 402,
    message: 'Storage quota exceeded',
  },
  // Terminal for the submitting device: retrying replays the same rejection forever.
  [ErrorCode.BILLING_TRANSACTION_NOT_ATTRIBUTABLE]: {
    httpStatus: 409,
    message: 'This purchase cannot be applied to this workspace',
  },
}
