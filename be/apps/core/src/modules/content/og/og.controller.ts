import { ContextParam, Controller, Get, Param } from '@tsuki/framework'
import type { Context } from 'hono'

import { OgService } from './og.service'

@Controller({ prefix: '/og', bypassGlobalPrefix: true })
export class OgController {
  constructor(private readonly ogService: OgService) {}

  @Get('/')
  async getHomepageOgImage(@ContextParam() context: Context) {
    return await this.ogService.renderHomepage(context)
  }

  @Get('/:photoId')
  async getOgImage(@ContextParam() context: Context, @Param('photoId') photoId: string) {
    return await this.ogService.render(context, photoId)
  }
}
