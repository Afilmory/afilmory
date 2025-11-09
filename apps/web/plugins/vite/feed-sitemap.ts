import { readFileSync } from 'node:fs'

import type { PhotoManifestItem } from '@afilmory/builder'
import { tsImport } from 'tsx/esm/api'
import type { Plugin } from 'vite'

import type { SiteConfig } from '../../../../site.config'
import { MANIFEST_PATH } from './__internal__/constants'

const { generateRSSFeed } = await tsImport('@afilmory/utils', import.meta.url)

export function createFeedSitemapPlugin(siteConfig: SiteConfig): Plugin {
  return {
    name: 'feed-sitemap-generator',
    apply: 'build',
    generateBundle() {
      try {
        const photosData: PhotoManifestItem[] = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')).data

        // Sort photos by date taken (newest first)
        const sortedPhotos = photosData.sort(
          (a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
        )

        // Generate RSS feed
        const rssXml = generateRSSFeed(sortedPhotos, siteConfig)

        // Generate sitemap
        const sitemapXml = generateSitemap(sortedPhotos, siteConfig)

        // Emit RSS feed
        this.emitFile({
          type: 'asset',
          fileName: 'feed.xml',
          source: rssXml,
        })

        // Emit sitemap
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemapXml,
        })

        console.info(`Generated RSS feed with ${sortedPhotos.length} photos`)
        console.info(`Generated sitemap with ${sortedPhotos.length + 1} URLs`)
      } catch (error) {
        console.error('Error generating RSS feed and sitemap:', error)
      }
    },
  }
}

function generateSitemap(photos: PhotoManifestItem[], config: SiteConfig): string {
  const now = new Date().toISOString()

  // Main page
  const mainPageXml = `  <url>
    <loc>${config.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`

  // Photo pages
  const photoUrls = photos
    .map((photo) => {
      const lastmod = new Date(photo.lastModified || photo.dateTaken).toISOString()
      return `  <url>
    <loc>${config.url}/${photo.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${mainPageXml}
${photoUrls}
</urlset>`
}
