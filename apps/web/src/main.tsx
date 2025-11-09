import './styles/index.css'

import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from './router'

if (import.meta.env.DEV) {
  const { start } = await import('react-scan')
  start()
}

createRoot(document.querySelector('#root')!).render(<RouterProvider router={router} />)
