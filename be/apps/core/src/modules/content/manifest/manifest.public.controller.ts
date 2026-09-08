import { BizException, ErrorCode } from '@core/errors'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { createProgressSseResponse } from '@core/modules/shared/http/sse'
import { Body, ContextParam, Controller, createZodSchemaDto, Get, Param, Post, Query } from '@tsuki-hono/common'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import type { Context } from 'hono'
import { z } from 'zod'

import { ManifestSyncService } from '../manifest-sync/manifest-sync.service'
import { MANIFEST_REVISION_HEADER, revisionETag } from '../manifest-sync/manifest-sync.types'
import { ManifestService } from './manifest.service'

const GetPhotosByIdsSchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform(s =>
      s
        .split(',')
        .map(t => t.trim())
        .filter(Boolean))
    .refine(arr => arr.length > 0, 'ids must contain at least one id'),
})

const SearchPhotosSchema = z.object({
  tags: z.array(z.string().min(1)).optional(),
  tagMode: z.enum(['union', 'intersection']).optional(),
  cameras: z.array(z.string().min(1)).optional(),
  lenses: z.array(z.string().min(1)).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(['asc', 'desc']).optional(),
  // Fix #268: 100 was a hard browsing cap that made galleries with >100
  // photos appear truncated even when quotas allowed more. Raise to a
  // defensible page-size ceiling; callers needing more should paginate via
  // offset.
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().nonnegative().optional(),
})

const GetChangesSchema = z.object({
  after: z
    .string()
    .regex(/^\d+$/)
    .transform(value => Number(value))
    .optional(),
})

class GetPhotosByIdsDto extends createZodSchemaDto(GetPhotosByIdsSchema) {}
class SearchPhotosDto extends createZodSchemaDto(SearchPhotosSchema) {}
class GetChangesDto extends createZodSchemaDto(GetChangesSchema) {}

@Controller('manifest')
export class ManifestPublicController {
  constructor(
    private readonly manifestService: ManifestService,
    private readonly manifestSyncService: ManifestSyncService,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  @Get()
  @BypassResponseTransform()
  async getManifest(@ContextParam() context: Context): Promise<Response> {
    const revision = await this.manifestService.getManifestRevision()
    const etag = revisionETag(revision)

    const ifNoneMatch = context.req.header('if-none-match')
    if (ifNoneMatch && this.matchesEtag(ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          [MANIFEST_REVISION_HEADER]: String(revision),
        },
      })
    }

    const manifest = await this.manifestService.getManifest()
    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        etag,
        [MANIFEST_REVISION_HEADER]: String(revision),
      },
    })
  }

  @Get('snapshot')
  @BypassResponseTransform()
  async getSnapshot() {
    const [revision, manifest] = await Promise.all([
      this.manifestService.getManifestRevision(),
      this.manifestService.getManifest(),
    ])
    return { revision, manifest }
  }

  @Get('changes')
  @BypassResponseTransform()
  async getChanges(@Query() query: GetChangesDto) {
    return await this.manifestSyncService.listChanges(query.after ?? 0)
  }

  @Get('events')
  @BypassResponseTransform()
  async streamEvents(@ContextParam() context: Context): Promise<Response> {
    const tenantId = requireTenantContext().tenant.id

    return createProgressSseResponse<{ type: 'revision', tenantId: string, revision: number }>({
      context,
      eventName: 'revision',
      handler: async ({ sendEvent, abortSignal }) => {
        const listener = ({ tenantId: changedTenantId, revision }: { tenantId: string, revision?: number }) => {
          if (changedTenantId !== tenantId) {
            return
          }
          void sendEvent({
            type: 'revision',
            tenantId,
            revision: revision ?? 0,
          })
        }
        this.eventEmitter.on('photo.manifest.changed', listener)
        try {
          const revision = await this.manifestService.getManifestRevision()
          await sendEvent({ type: 'revision', tenantId, revision })
          await new Promise<void>((resolve) => {
            if (abortSignal.aborted) {
              resolve()
              return
            }
            abortSignal.addEventListener('abort', () => resolve(), { once: true })
          })
        }
        finally {
          this.eventEmitter.off('photo.manifest.changed', listener)
        }
      },
    })
  }

  private matchesEtag(headerValue: string, currentEtag: string): boolean {
    const trimmed = headerValue.trim()
    if (trimmed === '*') {
      return true
    }

    const candidates = trimmed
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)

    return candidates.includes(currentEtag)
  }

  @Get('photos')
  @BypassResponseTransform()
  async getPhotosByIds(@Query() query: GetPhotosByIdsDto) {
    return await this.manifestService.getPhotosByIds(query.ids)
  }

  @Post('photos/search')
  @BypassResponseTransform()
  async searchPhotos(@Body() body: SearchPhotosDto) {
    return await this.manifestService.searchPhotos(body)
  }

  @Get('photos/:id')
  @BypassResponseTransform()
  async getPhoto(@Param('id') id: string) {
    const photo = await this.manifestService.getPhoto(id)
    if (!photo) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '照片不存在' })
    }
    return photo
  }
}
