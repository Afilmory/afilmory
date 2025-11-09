#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { RouteConfig } from '../src/routes'
import routes from '../src/routes.json'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const docsRoot = join(__dirname, '..')

async function build() {
  try {
    // Import the static module using file URL to handle path resolution
    const staticModulePath = pathToFileURL(join(docsRoot, 'dist/static/main-static.js')).href
    const staticModule = await import(staticModulePath)

    // Read the base HTML template
    const templatePath = join(docsRoot, 'dist/index.html')
    const templateHtml = await readFile(templatePath, 'utf-8')

    // Generate HTML for each route
    for (const route of routes) {
      const { html } = staticModule.render(route.path)

      // Replace placeholders in template
      const pageHtml = templateHtml
        .replace('<!--app-html-->', html)
        .replace('<!--app-title-->', `${(route.meta?.title as string) || route.title || 'Docs'} | Afilmory Docs`)
        .replace('<!--app-head-->', generateMetaTags(route))

      // Determine output path
      const outputPath = getOutputPath(route.path)

      // Ensure directory exists
      await mkdir(dirname(outputPath), { recursive: true })

      // Write the HTML file
      await writeFile(outputPath, pageHtml, 'utf-8')

      console.info(`✅ Generated: ${route.path} -> ${outputPath}`)
    }

    console.info('✅ Successfully built all static HTML files')
  } catch (error) {
    console.error('❌ Build failed:', error)
    process.exit(1)
  }
}

function generateMetaTags(route: Omit<RouteConfig, 'component'>): string {
  const meta = route.meta || {}
  const tags: string[] = []

  const description = meta.description as string
  const title = meta.title as string

  if (description) {
    tags.push(
      `<meta name="description" content="${description}">`,
      `<meta property="og:description" content="${description}">`,
    )
  }

  if (title) {
    tags.push(`<meta property="og:title" content="${title}">`)
  }

  return tags.join('\n    ')
}

function getOutputPath(routePath: string): string {
  const distDir = join(docsRoot, 'dist')

  if (routePath === '/') {
    return join(distDir, 'index.html')
  }

  // Remove leading slash and create directory structure
  const cleanPath = routePath.replace(/^\//, '')
  return join(distDir, cleanPath, 'index.html')
}

build()
