import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { it } from 'vitest'

const run = promisify(execFile)
const webDirectory = fileURLToPath(new URL('../../', import.meta.url))

it('native Node loads the server-serve Vite configuration', async () => {
  // Do not inherit a TS loader: Docker loads the bundled config with native ESM.
  const env = { ...process.env, BUILD_FOR_SERVER_SERVE: '1', AFILMORY_EMBED_MANIFEST: 'false', CI: '' }
  delete env.NODE_OPTIONS

  await run(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict'
    import { loadConfigFromFile } from 'vite'
    const result = await loadConfigFromFile({ command: 'build', mode: 'production' })
    assert.ok(result?.config)
  `], { cwd: webDirectory, env, timeout: 30_000 })
})
