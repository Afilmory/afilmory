import { env } from '@afilmory/env'
import { createOpenApiDocument } from '@tsuki/framework'
import type { Hono } from 'hono'

import { logger } from './helpers/logger.helper'
import { AppModules } from './modules/index.module'

interface RegisterOpenApiOptions {
  globalPrefix: string
}

function normalizePrefix(prefix: string): string {
  if (!prefix || prefix === '/') {
    return ''
  }

  const trimmed = prefix.trim()
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.replace(/\/+$/, '')
}

export function registerOpenApiRoutes(app: Hono, options: RegisterOpenApiOptions): void {
  const prefix = normalizePrefix(options.globalPrefix)

  const document = createOpenApiDocument(AppModules, {
    title: 'Core Service API',
    version: '1.0.0',
    description: 'OpenAPI specification generated from decorators',

    servers: prefix ? [{ url: prefix }] : undefined,
  })

  app.get('/internal/openapi.json', (context) => context.json(document))

  app.get('/internal/docs', (context) => {
    context.header('content-type', 'text/html; charset=utf-8')
    return context.html(renderScalarHtml('/internal/openapi.json'))
  })

  logger.info(`OpenAPI routes registered: http://localhost:${env.PORT}/internal/docs`)
}

function renderScalarHtml(specUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
  </head>

  <body>
    <div id="app"></div>

    <!-- Load the Script -->
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

    <!-- Initialize the Scalar API Reference -->
    <script>
      Scalar.createApiReference('#app', {
        // The URL of the OpenAPI/Swagger document
        url: '${specUrl}',
        // Avoid CORS issues
        proxyUrl: 'https://proxy.scalar.com',
      })
    </script>
  </body>
</html>`
}
