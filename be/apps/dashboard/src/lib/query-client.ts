import { QueryClient } from '@tanstack/react-query'
import { FetchError } from 'ofetch'

const ignoreStatuses = new Set([400, 401, 403, 404, 409, 422, 402])
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      retryDelay: 1000,
      retry(failureCount, error) {
        console.error(error)
        if (error instanceof FetchError && ignoreStatuses.has(error.statusCode!)) {
          return false
        }
        if (error instanceof FetchError && error.statusCode === undefined) {
          return false
        }

        return !!(3 - failureCount)
      },
      // throwOnError: import.meta.env.DEV,
    },
  },
})

export { queryClient }
