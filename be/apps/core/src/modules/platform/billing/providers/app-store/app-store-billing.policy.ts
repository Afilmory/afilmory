import type { BillingErrorCode } from '../../billing.error'

/**
 * Failures a client submission can never recover from by retrying: the transaction belongs to
 * another workspace, carries no attribution at all, or was signed for a different app/environment.
 * The device must stop replaying these, so they are the only billing errors translated into a
 * caller-visible response.
 */
const TERMINAL_CLIENT_BILLING_ERRORS: Partial<Record<BillingErrorCode, string>> = {
  APP_STORE_BILLING_SUBJECT_NOT_FOUND:
    'This purchase is no longer linked to a workspace. Contact support to have it reassigned.',
  APP_STORE_BILLING_SUBJECT_TOMBSTONED:
    'This purchase is no longer linked to a workspace. Contact support to have it reassigned.',
  APP_STORE_ENVIRONMENT_MISMATCH: 'This purchase was made in a different App Store environment.',
  APP_STORE_JWS_MALFORMED: 'This App Store purchase could not be verified.',
  APP_STORE_PRODUCT_NOT_ALLOWLISTED: 'This product is not offered by this workspace.',
  APP_STORE_TRANSACTION_MISSING_REQUIRED_FIELDS:
    'This purchase carries no workspace attribution, so it cannot be applied. Contact support.',
  APP_STORE_TRANSACTION_OWNER_MISMATCH: 'This subscription belongs to a different billing owner.',
  APP_STORE_TRANSACTION_TENANT_MISMATCH:
    'This Apple ID already subscribes in another workspace. Switch back to that workspace, or use a different Apple ID.',
  BILLING_ORIGINAL_TRANSACTION_CONFLICT:
    'This Apple ID already subscribes in another workspace. Switch back to that workspace, or use a different Apple ID.',
}

export function describeTerminalClientBillingError(code: BillingErrorCode): string | null {
  return TERMINAL_CLIENT_BILLING_ERRORS[code] ?? null
}
