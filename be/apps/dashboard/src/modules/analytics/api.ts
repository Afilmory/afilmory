import { coreApi } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type { DashboardAnalyticsResponse } from './types'

const DASHBOARD_ANALYTICS_ENDPOINT = '/dashboard/analytics'

export async function fetchDashboardAnalytics() {
  return camelCaseKeys<DashboardAnalyticsResponse>(
    await coreApi<DashboardAnalyticsResponse>(DASHBOARD_ANALYTICS_ENDPOINT, {
      method: 'GET',
    }),
  )
}
