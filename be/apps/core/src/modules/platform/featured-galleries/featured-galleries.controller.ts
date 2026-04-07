import { Controller, Get } from '@tsuki/framework'
import { AllowPlaceholderTenant } from 'core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from 'core/decorators/skip-tenant.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'

import { FeaturedGalleriesService } from './featured-galleries.service'

@Controller('featured-galleries')
@SkipTenantGuard()
@BypassResponseTransform()
export class FeaturedGalleriesController {
  constructor(private readonly featuredGalleriesService: FeaturedGalleriesService) {}

  @AllowPlaceholderTenant()
  @Get('/')
  async listFeaturedGalleries() {
    return await this.featuredGalleriesService.listFeaturedGalleries()
  }
}
