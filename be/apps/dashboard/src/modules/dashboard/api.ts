import { coreApi } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type { DashboardOverviewResponse } from './types'

const DASHBOARD_OVERVIEW_ENDPOINT = '/dashboard/overview'

export async function fetchDashboardOverview() {
  return camelCaseKeys<DashboardOverviewResponse>(
    await coreApi<DashboardOverviewResponse>(DASHBOARD_OVERVIEW_ENDPOINT, {
      method: 'GET',
    }),
  )
}
