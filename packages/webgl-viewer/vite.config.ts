import dts from 'unplugin-dts/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    minify: true,
    lib: {
      entry: './src/index.ts',
      name: 'WebGLImageViewer',
      fileName: () => `index.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react'],
    },
  },
  plugins: [
    dts({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      outDirs: ['dist'],
      tsconfigPath: 'tsconfig.json',
    }),
  ],
})
