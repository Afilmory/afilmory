import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import {
  isMobileOnboardingDismissible,
  resolveMobileOnboardingPresentation,
} from './onboardingPresentationPolicy.ts'

test('requires a new owner to create a workspace and configure storage', () => {
  assert.equal(isMobileOnboardingDismissible('workspace_required'), false)
  assert.equal(isMobileOnboardingDismissible('storage_required'), false)
  assert.deepEqual(resolveMobileOnboardingPresentation('workspace_required'), {
    dismissible: false,
    page: 'workspace',
  })
  assert.deepEqual(resolveMobileOnboardingPresentation('storage_required'), {
    dismissible: false,
    page: 'storage',
  })
})

test('allows users to leave states that cannot be completed immediately', () => {
  assert.equal(isMobileOnboardingDismissible('owner_action_required'), true)
  assert.equal(isMobileOnboardingDismissible('purchase_pending'), true)
  assert.equal(isMobileOnboardingDismissible('storage_recovery'), true)
})

test('keeps actionable waiting states on the storage page and omits a ready presentation', () => {
  assert.deepEqual(resolveMobileOnboardingPresentation('owner_action_required'), {
    dismissible: true,
    page: 'storage',
  })
  assert.deepEqual(resolveMobileOnboardingPresentation('purchase_pending'), {
    dismissible: true,
    page: 'storage',
  })
  assert.equal(resolveMobileOnboardingPresentation('ready'), null)
})
