import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { injectable } from 'tsyringe'

import type { StaticAssetDocument } from './static-asset.service'
import { StaticAssetService } from './static-asset.service'

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))

export const STATIC_DASHBOARD_BASENAME = '/platform'

const STATIC_DASHBOARD_ROUTE_SEGMENT = STATIC_DASHBOARD_BASENAME

const STATIC_DASHBOARD_ROOT_CANDIDATES = Array.from(
  new Set(
    [
      resolve(MODULE_DIR, '../../static/dashboard'),
      resolve(MODULE_DIR, '../../../../dashboard/dist'),
      resolve(process.cwd(), 'dist/static/dashboard'),
      resolve(process.cwd(), '../dist/static/dashboard'),
      resolve(process.cwd(), '../../dist/static/dashboard'),
      resolve(process.cwd(), '../../../dist/static/dashboard'),
      resolve(process.cwd(), 'static/dashboard'),
      resolve(process.cwd(), '../static/dashboard'),
      resolve(process.cwd(), '../../static/dashboard'),
      resolve(process.cwd(), '../../../static/dashboard'),
      resolve(process.cwd(), 'dashboard/dist'),
      resolve(process.cwd(), '../dashboard/dist'),
      resolve(process.cwd(), '../../dashboard/dist'),
      resolve(process.cwd(), '../../../dashboard/dist'),
      resolve(process.cwd(), 'be/apps/dashboard/dist'),
    ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ),
)

@injectable()
export class StaticDashboardService extends StaticAssetService {
  constructor() {
    super({
      routeSegment: STATIC_DASHBOARD_ROUTE_SEGMENT,
      rootCandidates: STATIC_DASHBOARD_ROOT_CANDIDATES,
      loggerName: 'StaticDashboardService',
    })
  }

  protected override async decorateDocument(document: StaticAssetDocument): Promise<void> {
    this.injectBasenameScript(document)
  }

  private injectBasenameScript(document: StaticAssetDocument): void {
    const head = document.head ?? document.querySelector('head')
    if (!head) {
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('#afilmory-dashboard-basename')
    if (existing) {
      existing.textContent = `window.__AFILMORY_DASHBOARD_BASENAME__ = ${JSON.stringify(STATIC_DASHBOARD_BASENAME)};`
      return
    }

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.id = 'afilmory-dashboard-basename'
    script.textContent = `window.__AFILMORY_DASHBOARD_BASENAME__ = ${JSON.stringify(STATIC_DASHBOARD_BASENAME)};`
    head.append(script)
  }
}
