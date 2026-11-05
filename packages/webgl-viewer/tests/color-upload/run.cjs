// Run with PLAYWRIGHT_MODULE=/path/to/@playwright/test; Safari uses safaridriver.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const cp = require('node:child_process')
const process = require('node:process')

const root = path.resolve(__dirname, '../../../..')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-color-upload-'))
let server, browser, driver, session, endpoint
async function command(route, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  const { value } = await response.json()
  if (!response.ok || value?.error) {
    throw new Error(JSON.stringify(value))
  }
  return value
}
;(async () => {
  try {
    fs.writeFileSync(path.join(temporary, 'vite.mjs'), `export default ${JSON.stringify({ build: {
      outDir: path.join(temporary, 'dist'),
      lib: { entry: path.join(root, 'packages/webgl-viewer/src/webgpu-color-upload.ts'), formats: ['es'], fileName: 'upload' },
    } })}`)
    cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', path.join(temporary, 'vite.mjs')], { cwd: root, stdio: 'inherit' })
    const bundle = fs.readdirSync(path.join(temporary, 'dist')).find(f => /^upload\.m?js$/.test(f))
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', req.url === '/upload.js' ? 'text/javascript' : 'text/html')
      res.end(req.url === '/upload.js' ? fs.readFileSync(path.join(temporary, 'dist', bundle)) : '<!doctype html><title>Viewer color upload test</title>')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    let page
    if (process.env.BROWSER_CHANNEL === 'safari') {
      endpoint = `http://127.0.0.1:${process.env.SAFARIDRIVER_PORT || 19616}`
      driver = cp.spawn('/usr/bin/safaridriver', ['-p', new URL(endpoint).port], { stdio: 'inherit' })
      for (let attempt = 0; ; attempt++) {
        try {
          await command('/status')
          break
        }
        catch (error) {
          if (attempt === 30) {
            throw error
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      session = (await command('/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })).sessionId
      await command(`/session/${session}/timeouts`, { script: 60000 })
      page = {
        goto: url => command(`/session/${session}/url`, { url }),
        async evaluate(fn) {
          const result = await command(`/session/${session}/execute/async`, {
            script: `const done=arguments[arguments.length-1]; (${fn.toString()})().then(value=>done({value}),error=>done({error:String(error)+"\\n"+error.stack}));`,
            args: [],
          })
          if (result.error) {
            throw new Error(result.error)
          }
          return result.value
        },
      }
    }
    else {
      browser = await require(process.env.PLAYWRIGHT_MODULE || '@playwright/test').chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chromium', args: ['--enable-unsafe-webgpu'] })
      page = await browser.newPage()
    }
    const result = await require('./check.cjs')(page, `http://127.0.0.1:${server.address().port}`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
  finally {
    if (browser) {
      await browser.close()
    }
    try {
      if (session) {
        await command(`/session/${session}`, undefined, 'DELETE')
      }
    }
    finally {
      driver?.kill()
      server?.close()
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  }
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`)
  process.exitCode = 1
})
