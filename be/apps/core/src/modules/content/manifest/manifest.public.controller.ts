import { Controller, Get } from '@tsuki/framework'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { ManifestService } from './manifest.service'

@Controller('manifest')
export class ManifestPublicController {
  constructor(private readonly manifestService: ManifestService) {}

  @Get()
  @BypassResponseTransform()
  async getManifest() {
    return await this.manifestService.getManifest()
  }
}
