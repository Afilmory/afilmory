import path from 'node:path'

const dirname = path.dirname(new URL(import.meta.url).pathname)
export const MANIFEST_PATH = path.resolve(dirname, '../../../../../packages/data/src/photos-manifest.json')

export const MONOREPO_ROOT_PATH = path.resolve(dirname, '../../../../..')
