import { createBrowserRouter } from 'react-router'

import { App } from './App'
import { ErrorElement } from './components/common/ErrorElement'
import { NotFound } from './components/common/NotFound'
import { routes } from './generated-routes'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: routes,
      errorElement: <ErrorElement />,
    },
    {
      path: '*',
      element: <NotFound />,
    },
  ],
  {
    basename: Reflect.get(window, '__AFILMORY_DASHBOARD_BASENAME__') as string,
  },
)
