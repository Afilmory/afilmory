// Small WebDriver adapter for this test harness, using the installed Safari.
// It does not change Safari settings or control existing non-automation windows.
const { spawn } = require('node:child_process')
const process = require('node:process')
const { setTimeout: delay } = require('node:timers/promises')

module.exports = async function launchSafari() {
  const port = Number(process.env.SAFARIDRIVER_PORT || 19615)
  const driver = spawn('/usr/bin/safaridriver', ['-p', String(port)], { stdio: 'pipe' })
  let diagnostic = ''
  driver.stderr.on('data', (data) => {
    diagnostic += data
  })
  const endpoint = `http://127.0.0.1:${port}`
  let session
  async function command(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60000),
    })
    const { value } = await response.json()
    if (!response.ok || value?.error) {
      throw new Error(JSON.stringify(value))
    }
    return value
  }
  async function control(body) {
    await fetch(`${process.env.AVIF_TEST_URL}/_test/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  try {
    for (let attempt = 0; ; attempt++) {
      if (driver.exitCode !== null) {
        throw new Error(`safaridriver exited: ${diagnostic}`)
      }
      try {
        await command('/status')
        break
      }
      catch (error) {
        if (attempt === 30) {
          throw error
        }
        await delay(100)
      }
    }
    session = await command('/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })
    const base = `/session/${session.sessionId}`
    await command(`${base}/timeouts`, { script: 60000, pageLoad: 30000 })
    const execute = async (fn, arg) => {
      const result = await command(`${base}/execute/async`, {
        script: `const done=arguments[arguments.length-1]; Promise.resolve().then(()=>(${fn.toString()})(arguments[0])).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error.stack||error)}));`,
        args: [arg ?? null],
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      return result.value
    }
    return {
      version: () => session.capabilities.browserVersion,
      async newPage({ viewport } = {}) {
        if (viewport) {
          await command(`${base}/window/rect`, { width: viewport.width + 100, height: viewport.height + 150 })
        }
        const handlers = new Map()
        const init = []
        let prefix = ''
        return {
          on(event, handler) { handlers.set(event, handler) },
          async addInitScript(fn, arg) { init.push([fn, arg]) },
          async setWorkerPrefix(value) { prefix = value },
          async goto(url) {
            await control({ prefix, reset: true })
            await command(`${base}/url`, { url })
            await execute(() => {
              window.__testEvents = []
              for (const type of ['error', 'warn']) {
                // eslint-disable-next-line no-console -- Capture application diagnostics without WebDriver log APIs.
                const original = console[type].bind(console)
                // eslint-disable-next-line no-console -- Preserve and forward the original console method.
                console[type] = (...args) => {
                  window.__testEvents.push({ type: type === 'warn' ? 'warning' : type, text: args.map(String).join(' ') })
                  original(...args)
                }
              }
              window.addEventListener('error', e => window.__testEvents.push({ type: 'pageerror', text: e.message }))
              window.addEventListener('unhandledrejection', e => window.__testEvents.push({ type: 'pageerror', text: String(e.reason) }))
            })
            for (const [fn, arg] of init) {
              await execute(fn, arg)
            }
          },
          async evaluate(fn, arg) {
            const value = await execute(fn, arg)
            const events = await execute(() => window.__testEvents.splice(0))
            for (const event of events) {
              if (event.type === 'pageerror') {
                handlers.get('pageerror')?.({ message: event.text })
              }
              else {
                handlers.get('console')?.({ type: () => event.type, text: () => event.text })
              }
            }
            const requests = await (await fetch(`${process.env.AVIF_TEST_URL}/_test/requests`)).json()
            for (const url of requests) {
              handlers.get('request')?.({ url: () => url })
            }
            return value
          },
          async close() { await command(`${base}/url`, { url: 'about:blank' }) },
        }
      },
      async close() {
        try {
          await command(base, undefined, 'DELETE')
        }
        finally {
          driver.kill()
        }
      },
    }
  }
  catch (error) {
    driver.kill()
    throw error
  }
}
