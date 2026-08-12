export type BillingErrorCode
  = | 'APP_STORE_APPLE_ID_NOT_CONFIGURED'
    | 'APP_STORE_BILLING_SUBJECT_NOT_FOUND'
    | 'APP_STORE_BILLING_SUBJECT_TOMBSTONED'
    | 'APP_STORE_ENVIRONMENT_MISMATCH'
    | 'APP_STORE_JWS_MALFORMED'
    | 'APP_STORE_NOTIFICATION_INVALID'
    | 'APP_STORE_PRODUCT_NOT_ALLOWLISTED'
    | 'APP_STORE_ROOT_CERTIFICATES_NOT_CONFIGURED'
    | 'APP_STORE_TRANSACTION_MISSING_REQUIRED_FIELDS'
    | 'APP_STORE_TRANSACTION_OWNER_MISMATCH'
    | 'APP_STORE_TRANSACTION_TENANT_MISMATCH'
    | 'BILLING_OFFER_NOT_FOUND'
    | 'BILLING_ORIGINAL_TRANSACTION_CONFLICT'
    | 'BILLING_PROVIDER_EVENT_RECEIPT_FAILED'
    | 'BILLING_STATUS_NOT_ACTIONABLE'
    | 'BILLING_SUBJECT_CREATION_FAILED'
    | 'BILLING_SUBSCRIPTION_NOT_FOUND'
    | 'BILLING_SUBSCRIPTION_UPSERT_FAILED'

/**
 * Reconciliation failures are persisted to `billing_provider_event.error_code` and replayed by
 * operators, so they carry a stable machine code rather than a user-facing message. Anything the
 * caller should see instead belongs in a `BizException`.
 */
export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode) {
    super(code)
    this.name = 'BillingError'
  }
}
