import { describe, expect, it, vi } from 'vitest'

import { StaticAssetHostService } from './static-asset-host.service'

function createService(baseDomain = 'afilmory.art') {
  const getSettings = vi.fn().mockResolvedValue({ baseDomain })
  const eventService = { on: vi.fn() }
  const service = new StaticAssetHostService({ getSettings } as never, eventService as never)
  return { getSettings, service }
}

describe('static asset host service', () => {
  it.each(['localhost:1841', 'tenant.localhost:1841', '127.0.0.1:1841'])(
    'keeps dashboard assets on the local request origin for %s',
    async (requestHost) => {
      const { getSettings, service } = createService()

      await expect(service.getStaticAssetHost(requestHost)).resolves.toBeNull()
      expect(getSettings).not.toHaveBeenCalled()
    },
  )

  it('uses the configured static host for non-local requests', async () => {
    const { getSettings, service } = createService()

    await expect(service.getStaticAssetHost('gallery.example.com')).resolves.toBe('//static.afilmory.art')
    expect(getSettings).toHaveBeenCalledOnce()
  })
})
