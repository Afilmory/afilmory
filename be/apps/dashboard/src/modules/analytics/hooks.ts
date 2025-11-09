import { useQuery } from '@tanstack/react-query'

import { fetchDashboardAnalytics } from './api'
import type { DashboardAnalyticsResponse } from './types'

export const DASHBOARD_ANALYTICS_QUERY_KEY = ['dashboard', 'analytics'] as const

export function useDashboardAnalyticsQuery() {
  return useQuery<DashboardAnalyticsResponse>({
    queryKey: DASHBOARD_ANALYTICS_QUERY_KEY,
    queryFn: fetchDashboardAnalytics,
    staleTime: 60 * 1000,
  })
}
