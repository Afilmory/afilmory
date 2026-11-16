import 'reflect-metadata'

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { CorsMiddleware } from './cors.middleware'

function createApp() {
  const app = new Hono()
  const middleware = new CorsMiddleware()
  app.use('*', (context, next) => middleware.use(context, next))
  app.get('/api/auth/session', context => context.json({ cookie: context.req.header('cookie') ?? null }))
  app.get('/static/web/app.js', context => context.text('export default true'))
  return app
}

describe('cors credential isolation', () => {
  it.each(['https://attacker.example.test', 'https://unrelated.test', 'null'])(
    'does not authorize credentialed response access from %s',
    async (origin) => {
      const response = await createApp().request('https://victim.example.test/api/auth/session', {
        headers: { origin, cookie: 'afilmory-tenant.session_token=victim-session' },
      })

      expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    },
  )

  it('continues to serve same-origin authenticated requests', async () => {
    const response = await createApp().request('https://victim.example.test/api/auth/session', {
      headers: { origin: 'https://victim.example.test', cookie: 'afilmory-tenant.session_token=victim-session' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cookie: 'afilmory-tenant.session_token=victim-session' })
  })

  it('keeps static assets readable from tenant origins without credentials', async () => {
    const response = await createApp().request('https://static.example.test/static/web/app.js', {
      headers: { origin: 'https://gallery.example.test' },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    await expect(response.text()).resolves.toBe('export default true')
  })

  it('does not grant credentialed access through a preflight', async () => {
    const response = await createApp().request('https://victim.example.test/api/auth/session', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://attacker.example.test',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })
})
