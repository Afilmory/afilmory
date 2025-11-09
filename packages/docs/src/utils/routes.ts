import type { RouteConfig } from '../routes'
import routes from '../routes'

export const getMatchedRoute = (currentPath: string): RouteConfig | undefined => {
  return routes.find((route) => {
    const normalizedCurrentPath =
      currentPath.endsWith('/') && currentPath !== '/' ? currentPath.slice(0, -1) : currentPath
    const normalizedRoutePath = route.path.endsWith('/') && route.path !== '/' ? route.path.slice(0, -1) : route.path
    return normalizedRoutePath === normalizedCurrentPath
  })
}
