import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { cyan, dim, green } from 'kolorist'
import type { PluginOption, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import { checker } from 'vite-plugin-checker'
import { createHtmlPlugin } from 'vite-plugin-html'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

import PKG from '../../package.json'
import { siteConfig } from '../../site.config'
import { astPlugin } from './plugins/vite/ast'
import { createDependencyChunksPlugin } from './plugins/vite/deps'
import { createFeedSitemapPlugin } from './plugins/vite/feed-sitemap'
import { localesJsonPlugin } from './plugins/vite/locales-json'
import { manifestInjectPlugin } from './plugins/vite/manifest-inject'
import { ogImagePlugin } from './plugins/vite/og-image-plugin'
import { photosStaticPlugin } from './plugins/vite/photos-static'
import { siteConfigInjectPlugin } from './plugins/vite/site-config-inject'

const devPrint = (): PluginOption => ({
  name: 'dev-print',
  configureServer(server: ViteDevServer) {
    server.printUrls = () => {
      console.info(`  ${green('➜')}  ${dim('Next.js SSR')}: ${cyan('http://localhost:1924')}`)
    }
  },
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.CI) {
  rmSync(path.join(process.cwd(), 'src/pages/(debug)'), {
    recursive: true,
    force: true,
  })
}
const DEV_NEXT_JS = process.env.DEV_NEXT_JS === 'true'

const ReactCompilerConfig = {
  /* ... */
}

const staticWebBuildPlugins: PluginOption[] = [
  manifestInjectPlugin(),
  siteConfigInjectPlugin(),
  photosStaticPlugin(),

  VitePWA({
    base: '/',
    scope: '/',
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
    manifest: {
      name: siteConfig.title,
      short_name: siteConfig.name,
      description: siteConfig.description,
      theme_color: '#1c1c1e',
      background_color: '#1c1c1e',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: 'android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: 'android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: 'apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      globIgnores: ['**/*.{jpg,jpeg}'], // 忽略大图片文件
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
            },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'gstatic-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
            },
          },
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
            },
          },
        },
      ],
    },
    devOptions: {
      enabled: false, // 开发环境不启用 PWA
    },
  }),

  ogImagePlugin({
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.name,
    siteUrl: siteConfig.url,
  }),
  createFeedSitemapPlugin(siteConfig),
  createHtmlPlugin({
    minify: {
      collapseWhitespace: true,
      keepClosingSlash: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: true,
    },
    inject: {
      data: {
        title: siteConfig.title,
        description: siteConfig.description,
      },
    },
  }),
]

const BUILD_FOR_SERVER_SERVE = process.env.BUILD_FOR_SERVER_SERVE === '1'
// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    base: BUILD_FOR_SERVER_SERVE ? '/static/web/' : '/',
    plugins: [
      codeInspectorPlugin({
        bundler: 'vite',
        hotKeys: ['altKey'],
      }),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
        },
      }),

      astPlugin,
      tsconfigPaths(),
      checker({
        typescript: true,
        enableBuild: true,
        root: __dirname,
      }),

      createDependencyChunksPlugin([
        ['heic-to'],
        ['react', 'react-dom'],
        ['i18next', 'i18next-browser-languagedetector', 'react-i18next'],
      ]),
      localesJsonPlugin(),
      tailwindcss(),
      ...(BUILD_FOR_SERVER_SERVE ? [] : staticWebBuildPlugins),
      process.env.analyzer && analyzer(),

      devPrint(),
    ],
    server: {
      port: !DEV_NEXT_JS ? 1924 : 13333, // 1924 年首款 35mm 相机问世
    },
    define: {
      APP_DEV_CWD: JSON.stringify(process.cwd()),
      APP_NAME: JSON.stringify(PKG.name),
      BUILT_DATE: JSON.stringify(new Date().toLocaleDateString()),
      GIT_COMMIT_HASH: JSON.stringify(getGitHash()),
    },
  }
})

function getGitHash() {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch (e) {
    console.error('Failed to get git hash', e)
    return ''
  }
}
