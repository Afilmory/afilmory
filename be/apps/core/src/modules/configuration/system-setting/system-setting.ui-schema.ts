import { BILLING_PLAN_IDS } from 'core/modules/platform/billing/billing-plan.constants'
import type { UiSchemaTFunction } from 'core/modules/ui/ui-schema/ui-schema.i18n'
import { identityUiSchemaT } from 'core/modules/ui/ui-schema/ui-schema.i18n'
import type { UiNode, UiSchema } from 'core/modules/ui/ui-schema/ui-schema.type'

import type { SystemSettingField } from './system-setting.constants'

export const SYSTEM_SETTING_UI_SCHEMA_VERSION = '1.4.0'

const PLAN_QUOTA_FIELDS = [
  {
    suffix: 'monthlyAssetProcessLimit',
    titleKey: 'system.sections.billing.fields.quota.monthly-asset.title',
    descriptionKey: 'system.sections.billing.fields.quota.monthly-asset.description',
    placeholderKey: 'system.sections.billing.fields.quota.monthly-asset.placeholder',
  },
  {
    suffix: 'libraryItemLimit',
    titleKey: 'system.sections.billing.fields.quota.library-limit.title',
    descriptionKey: 'system.sections.billing.fields.quota.library-limit.description',
    placeholderKey: 'system.sections.billing.fields.quota.library-limit.placeholder',
  },
  {
    suffix: 'maxUploadSizeMb',
    titleKey: 'system.sections.billing.fields.quota.upload-limit.title',
    descriptionKey: 'system.sections.billing.fields.quota.upload-limit.description',
    placeholderKey: 'system.sections.billing.fields.quota.upload-limit.placeholder',
  },
  {
    suffix: 'maxSyncObjectSizeMb',
    titleKey: 'system.sections.billing.fields.quota.sync-limit.title',
    descriptionKey: 'system.sections.billing.fields.quota.sync-limit.description',
    placeholderKey: 'system.sections.billing.fields.quota.sync-limit.placeholder',
  },
] as const

const PLAN_PRICING_FIELDS = [
  {
    suffix: 'monthlyPrice',
    titleKey: 'system.sections.billing.fields.pricing.monthly-price.title',
    descriptionKey: 'system.sections.billing.fields.pricing.monthly-price.description',
    placeholderKey: 'system.sections.billing.fields.pricing.monthly-price.placeholder',
    helperKey: 'system.sections.billing.fields.pricing.monthly-price.helper',
    inputType: 'number' as const,
  },
  {
    suffix: 'currency',
    titleKey: 'system.sections.billing.fields.pricing.currency.title',
    descriptionKey: 'system.sections.billing.fields.pricing.currency.description',
    placeholderKey: 'system.sections.billing.fields.pricing.currency.placeholder',
    helperKey: 'system.sections.billing.fields.pricing.currency.helper',
    inputType: 'text' as const,
  },
] as const

const PLAN_PAYMENT_FIELDS = [
  {
    suffix: 'creemProductId',
    titleKey: 'system.sections.billing.fields.payment.creem-product.title',
    descriptionKey: 'system.sections.billing.fields.payment.creem-product.description',
    placeholderKey: 'system.sections.billing.fields.payment.creem-product.placeholder',
  },
] as const

function buildBillingPlanGroups(t: UiSchemaTFunction): ReadonlyArray<UiNode<SystemSettingField>> {
  return BILLING_PLAN_IDS.map((planId) => {
    const quotaFields = PLAN_QUOTA_FIELDS.map((field) => ({
      type: 'field' as const,
      id: `${planId}-${field.suffix}`,
      title: t(field.titleKey),
      description: t(field.descriptionKey),
      helperText: t('system.sections.billing.fields.quota.helper'),
      key: `billingPlan.${planId}.quota.${field.suffix}` as SystemSettingField,
      component: {
        type: 'text' as const,
        inputType: 'number' as const,
        placeholder: t(field.placeholderKey),
      },
    }))

    const pricingFields = PLAN_PRICING_FIELDS.map((field) => ({
      type: 'field' as const,
      id: `${planId}-pricing-${field.suffix}`,
      title: t(field.titleKey),
      description: t(field.descriptionKey),
      helperText: t(field.helperKey),
      key: `billingPlan.${planId}.pricing.${field.suffix}` as SystemSettingField,
      component: {
        type: 'text' as const,
        inputType: field.inputType,
        placeholder: t(field.placeholderKey),
      },
    }))

    const paymentFields = PLAN_PAYMENT_FIELDS.map((field) => ({
      type: 'field' as const,
      id: `${planId}-payment-${field.suffix}`,
      title: t(field.titleKey),
      description: t(field.descriptionKey),
      helperText: t('system.sections.billing.fields.payment.helper'),
      key: `billingPlan.${planId}.payment.${field.suffix}` as SystemSettingField,
      component: {
        type: 'text' as const,
        placeholder: t(field.placeholderKey),
      },
    }))

    return {
      type: 'group' as const,
      id: `billing-plan-${planId}`,
      title: t(`system.sections.billing.plans.${planId}.title`),
      description: t(`system.sections.billing.plans.${planId}.description`),
      children: [...quotaFields, ...pricingFields, ...paymentFields],
    } satisfies UiNode<SystemSettingField>
  })
}

export function createSystemSettingUiSchema(t: UiSchemaTFunction): UiSchema<SystemSettingField> {
  return {
    version: SYSTEM_SETTING_UI_SCHEMA_VERSION,
    title: t('system.title'),
    description: t('system.description'),
    sections: [
      {
        type: 'section',
        id: 'registration-control',
        title: t('system.sections.registration.title'),
        description: t('system.sections.registration.description'),
        icon: 'user-cog',
        children: [
          {
            type: 'field',
            id: 'registration-allow',
            title: t('system.sections.registration.fields.allow-registration.title'),
            description: t('system.sections.registration.fields.allow-registration.description'),
            key: 'allowRegistration',
            component: {
              type: 'switch',
            },
          },
          {
            type: 'field',
            id: 'local-provider-enabled',
            title: t('system.sections.registration.fields.local-provider.title'),
            description: t('system.sections.registration.fields.local-provider.description'),
            key: 'localProviderEnabled',
            component: {
              type: 'switch',
            },
          },
          {
            type: 'field',
            id: 'platform-base-domain',
            title: t('system.sections.registration.fields.base-domain.title'),
            description: t('system.sections.registration.fields.base-domain.description'),
            helperText: t('system.sections.registration.fields.base-domain.helper'),
            key: 'baseDomain',
            component: {
              type: 'text',
              placeholder: t('system.sections.registration.fields.base-domain.placeholder'),
            },
          },
          {
            type: 'field',
            id: 'registration-max-users',
            title: t('system.sections.registration.fields.max-users.title'),
            description: t('system.sections.registration.fields.max-users.description'),
            helperText: t('system.sections.registration.fields.max-users.helper'),
            key: 'maxRegistrableUsers',
            component: {
              type: 'text' as const,
              inputType: 'number',
              placeholder: t('system.sections.registration.fields.max-users.placeholder'),
            },
          },
        ],
      },
      {
        type: 'section',
        id: 'billing-plan-settings',
        title: t('system.sections.billing.title'),
        description: t('system.sections.billing.description'),
        icon: 'badge-dollar-sign',
        children: buildBillingPlanGroups(t),
      },
      {
        type: 'section',
        id: 'storage-plan-settings',
        title: t('system.sections.storage-plans.title'),
        description: t('system.sections.storage-plans.description'),
        icon: 'database',
        children: [
          {
            type: 'field',
            id: 'storage-plan-catalog',
            title: t('system.sections.storage-plans.fields.catalog.title'),
            description: t('system.sections.storage-plans.fields.catalog.description'),
            helperText: t('system.sections.storage-plans.fields.catalog.helper'),
            key: 'storagePlanCatalog',
            component: { type: 'slot', name: 'storage-plan-catalog' } as const,
          },
          {
            type: 'field',
            id: 'storage-plan-pricing',
            title: t('system.sections.storage-plans.fields.pricing.title'),
            description: t('system.sections.storage-plans.fields.pricing.description'),
            helperText: t('system.sections.storage-plans.fields.pricing.helper'),
            key: 'storagePlanPricing',
            component: { type: 'slot', name: 'storage-plan-pricing' } as const,
          },
          {
            type: 'field',
            id: 'storage-plan-products',
            title: t('system.sections.storage-plans.fields.products.title'),
            description: t('system.sections.storage-plans.fields.products.description'),
            helperText: t('system.sections.storage-plans.fields.products.helper'),
            key: 'storagePlanProducts',
            component: { type: 'slot', name: 'storage-plan-products' } as const,
          },
          {
            type: 'field',
            id: 'storage-provider-managed',
            title: t('system.sections.storage-plans.fields.managed-provider.title'),
            description: t('system.sections.storage-plans.fields.managed-provider.description'),
            helperText: t('system.sections.storage-plans.fields.managed-provider.helper'),
            key: 'managedStorageProvider',
            component: {
              type: 'text',
              placeholder: t('system.sections.storage-plans.fields.managed-provider.placeholder'),
            },
          },
        ],
      },
      {
        type: 'section',
        id: 'oauth-providers',
        title: t('system.sections.oauth.title'),
        description: t('system.sections.oauth.description'),
        icon: 'shield-check',
        children: [
          {
            type: 'field',
            id: 'oauth-gateway-url',
            title: t('system.sections.oauth.fields.gateway.title'),
            description: t('system.sections.oauth.fields.gateway.description'),
            helperText: t('system.sections.oauth.fields.gateway.helper'),
            key: 'oauthGatewayUrl',
            component: {
              type: 'text',
              placeholder: t('system.sections.oauth.fields.gateway.placeholder'),
            },
          },
          {
            type: 'group',
            id: 'oauth-google',
            title: t('system.sections.oauth.groups.google.title'),
            description: t('system.sections.oauth.groups.google.description'),
            icon: 'badge-check',
            children: [
              {
                type: 'field',
                id: 'oauth-google-client-id',
                title: t('system.sections.oauth.groups.google.fields.client-id.title'),
                description: t('system.sections.oauth.groups.google.fields.client-id.description'),
                key: 'oauthGoogleClientId',
                component: {
                  type: 'text',
                  placeholder: t('system.sections.oauth.groups.google.fields.client-id.placeholder'),
                },
              },
              {
                type: 'field',
                id: 'oauth-google-client-secret',
                title: t('system.sections.oauth.groups.google.fields.client-secret.title'),
                description: t('system.sections.oauth.groups.google.fields.client-secret.description'),
                key: 'oauthGoogleClientSecret',
                component: {
                  type: 'secret',
                  placeholder: t('system.sections.oauth.groups.google.fields.client-secret.placeholder'),
                  revealable: true,
                  autoComplete: 'off',
                },
              },
            ],
          },
          {
            type: 'group',
            id: 'oauth-github',
            title: t('system.sections.oauth.groups.github.title'),
            description: t('system.sections.oauth.groups.github.description'),
            icon: 'github',
            children: [
              {
                type: 'field',
                id: 'oauth-github-client-id',
                title: t('system.sections.oauth.groups.github.fields.client-id.title'),
                description: t('system.sections.oauth.groups.github.fields.client-id.description'),
                key: 'oauthGithubClientId',
                component: {
                  type: 'text',
                  placeholder: t('system.sections.oauth.groups.github.fields.client-id.placeholder'),
                },
              },
              {
                type: 'field',
                id: 'oauth-github-client-secret',
                title: t('system.sections.oauth.groups.github.fields.client-secret.title'),
                description: t('system.sections.oauth.groups.github.fields.client-secret.description'),
                key: 'oauthGithubClientSecret',
                component: {
                  type: 'secret',
                  placeholder: t('system.sections.oauth.groups.github.fields.client-secret.placeholder'),
                  revealable: true,
                  autoComplete: 'off',
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

const SYSTEM_SETTING_SCHEMA_FOR_KEYS = createSystemSettingUiSchema(identityUiSchemaT)

function collectKeys(nodes: ReadonlyArray<UiNode<SystemSettingField>>): SystemSettingField[] {
  const keys: SystemSettingField[] = []

  for (const node of nodes) {
    if (node.type === 'field') {
      keys.push(node.key)
      continue
    }

    keys.push(...collectKeys(node.children))
  }

  return keys
}

export const SYSTEM_SETTING_UI_SCHEMA_KEYS = Array.from(
  new Set(collectKeys(SYSTEM_SETTING_SCHEMA_FOR_KEYS.sections)),
) as SystemSettingField[]
