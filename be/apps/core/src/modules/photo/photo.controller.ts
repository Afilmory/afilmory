import { Controller, createZodDto,Get, Post, Query } from '@afilmory/framework'
import { Roles } from 'core/guards/roles.decorator'
import { z } from 'zod'

import { PhotoService } from './photo.service'

const listPhotosQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((payload) => ({
    page: payload.page ?? 1,
    limit: payload.limit ?? 24,
  }))

class ListPhotosQueryDto extends createZodDto(listPhotosQuerySchema) {}

@Controller('photos')
@Roles('admin')
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  @Get('/')
  async list(@Query() query: ListPhotosQueryDto) {
    return await this.photoService.listPhotos({
      page: query.page,
      limit: query.limit,
    })
  }

  @Get('/manifest')
  async manifest() {
    return await this.photoService.getManifestSummary()
  }

  @Post('/sync')
  async sync() {
    return await this.photoService.syncFromActiveStorage()
  }
}
