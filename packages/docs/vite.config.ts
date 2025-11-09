import path from 'node:path'

import mdx from '@mdx-js/rollup'
import shikiRehype from '@shikijs/rehype'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import { defineConfig } from 'vite'

import remarkHeading from './plugins/remark-heading'
import { routeGenerator } from './plugins/route-generater'
import { tocExtractor } from './plugins/toc-extractor'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tocExtractor({
      contentsDir: 'contents',
      outputDir: 'src',
      outputFile: 'toc-data.ts',
    }),
    routeGenerator({
      contentsDir: 'contents',
      outputDir: 'src',
      outputFile: 'routes.ts',
      indexFile: 'index',
    }),
    tailwindcss(),
    {
      enforce: 'pre',
      ...mdx({
        // files inside contents will be processed as MDX
        include: ['contents/**/*.{md,mdx}'],
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [[remarkHeading, { prefix: 'heading-' }], remarkFrontmatter, remarkGfm],
        rehypePlugins: [
          [
            shikiRehype,
            {
              themes: { light: 'github-light', dark: 'github-dark' },
              inline: 'tailing-curly-colon',
              langs: [
                'javascript',
                'typescript',
                'jsx',
                'tsx',
                'mdx',
                'json',
                'shell',
                'bash',
                'yaml',
                'dockerfile',
                'css',
              ],
            },
          ],
        ],
      }),
    },
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey'],
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
