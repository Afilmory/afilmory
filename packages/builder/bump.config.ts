import { defineConfig } from 'nbump'

export default defineConfig({
  leading: ['npm run build'],
  publish: true,
  allowDirty: true,
  allowedBranches: ['dev/*', 'main'],
  withTags: false,
  tag: false,
  commit: false,
  push: false,
})
