// Run with: pnpm --filter @afilmory/core exec vite-node scripts/tenant-security-verification.ts
// Requires agent-browser and Chrome. All accounts, sessions and data are disposable and in memory.
import 'reflect-metadata'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { serve } from '@hono/node-server'
import { HttpContext } from '@tsuki-hono/common'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { Hono } from 'hono'

import { CorsMiddleware } from '../src/middlewares/cors.middleware'
import { StaticWebService } from '../src/modules/infrastructure/static-web/static-web.service'
import { AUTH_COOKIE_POLICY } from '../src/modules/platform/auth/auth-cookie.policy'

const run = promisify(execFile)
const browserData = await mkdtemp(join(tmpdir(), 'afilmory-tenant-security-'))
const sessionName = `afilmory-tenant-security-${process.pid}`
async function browser(...args: string[]) {
  const { stdout } = await run('agent-browser', [
    '--session',
    sessionName,
    '--no-auto-connect',
    '--profile',
    browserData,
    ...args,
  ], { timeout: 30_000 })
  return stdout.trim()
}
const payload = '</script><script>window.__injected__ = true</script>'
const COOKIE_DOMAIN_ATTRIBUTE = /;\s*domain=/i
const template = '<!doctype html><html><head><title>Security fixture</title><script id="config"></script><script id="manifest"></script></head><body>Disposable security fixture</body></html>'
const gallery = new StaticWebService(
  { getManifest: async () => ({ version: 'v10', data: [{ id: 'photo', title: payload }] }) } as never,
  { getSiteConfig: async () => ({ name: 'Fixture', title: payload, description: payload, author: { name: 'Fixture' } }) } as never,
  { getStaticAssetHost: async () => null } as never,
)
const app = new Hono()
const cors = new CorsMiddleware()
app.use('*', (context, next) => HttpContext.run(context, next))
app.use('*', (context, next) => cors.use(context, next))

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
await once(server, 'listening')
const address = server.address()
assert.ok(address && typeof address !== 'string')
const victimOrigin = `http://victim.afilmory-security.localhost:${address.port}`
const attackerOrigin = `http://attacker.afilmory-security.localhost:${address.port}`
const auth = betterAuth({
  baseURL: victimOrigin,
  secret: 'disposable-security-fixture-secret-at-least-32-characters',
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  emailAndPassword: { enabled: true },
  advanced: AUTH_COOKIE_POLICY,
  trustedOrigins: [victimOrigin, attackerOrigin],
})
let crossOriginRequest: { authenticated: boolean, fetchSite: string | undefined } | undefined

app.get('/seed', async (context) => {
  assert.equal(new URL(context.req.url).origin, victimOrigin)
  const response = await auth.api.signUpEmail({
    body: { name: 'Disposable Victim', email: 'victim@example.test', password: 'disposable-password-123' },
    asResponse: true,
  })
  assert.equal(response.status, 200)
  for (const cookie of response.headers.getSetCookie()) {
    assert.ok(!COOKIE_DOMAIN_ATTRIBUTE.test(cookie), 'session cookies must be host-only')
    context.header('set-cookie', cookie, { append: true })
  }
  return context.html('<!doctype html><title>Victim seeded</title><p>Disposable victim signed in</p>')
})
app.get('/api/auth/session', async (context) => {
  const session = await auth.api.getSession({ headers: context.req.raw.headers })
  if (context.req.header('origin') === attackerOrigin) {
    crossOriginRequest = { authenticated: !!session, fetchSite: context.req.header('sec-fetch-site') }
  }
  return context.json(session ? { signedIn: true, privateMarker: 'victim-only-data' } : null)
})
app.get('/static/web/probe.js', context => context.text('public-static-asset'))
app.get('/', async context => context.html(await gallery.transformIndexHtml(template, {
  absolutePath: '/static/web/index.html',
  relativePath: 'index.html',
  stats: { mtime: new Date(0), size: template.length },
})))

try {
  await browser('open', `${victimOrigin}/seed`)
  const signedIn = await browser('eval', 'fetch("/api/auth/session", { credentials: "include" }).then(r => r.json()).then(s => s?.signedIn === true)')
  assert.equal(signedIn, 'true')
  console.log('PASS: same-origin request reads a real Better Auth session with a host-only cookie')

  await browser('open', attackerOrigin)
  const isolated = await browser('eval', 'window.__injected__ === undefined && document.scripts.length === 2 && window.__SITE_CONFIG__.title.startsWith("</script>") && window.__MANIFEST__.data[0].title.startsWith("</script>")')
  assert.equal(isolated, 'true')
  console.log('PASS: gallery settings and manifest payloads stay data in Chromium')

  const blocked = await browser('eval', `fetch(${JSON.stringify(`${victimOrigin}/api/auth/session`)}, { credentials: "include" }).then(() => false, () => true)`)
  assert.equal(blocked, 'true')
  assert.deepEqual(crossOriginRequest, { authenticated: true, fetchSite: 'same-site' })
  console.log('PASS: Chromium blocks sibling-tenant response access even though the real victim session cookie was sent')

  const publicAsset = await browser('eval', `fetch(${JSON.stringify(`${victimOrigin}/static/web/probe.js`)}, { credentials: "omit" }).then(r => r.text())`)
  assert.equal(publicAsset, '"public-static-asset"')
  console.log('PASS: anonymous cross-origin static assets remain readable')

  const anonymous = await browser('eval', `fetch(${JSON.stringify(`${victimOrigin}/api/auth/session`)}, { credentials: "omit" }).then(r => r.json())`)
  assert.equal(anonymous, 'null')
  console.log('PASS: anonymous cross-origin session reads disclose no session')
}
finally {
  await browser('close').catch(() => {})
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await rm(browserData, { recursive: true, force: true })
}
