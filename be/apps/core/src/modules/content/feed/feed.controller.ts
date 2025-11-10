import { ContextParam, Controller, Get } from '@afilmory/framework'
import type { Context } from 'hono'

import type { FeedDocument } from './feed.service'
import { FeedService } from './feed.service'

@Controller({ bypassGlobalPrefix: true })
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('/feed.xml')
  async getFeed(@ContextParam() context: Context): Promise<Response> {
    const document = await this.feedService.getFeedDocument()

    if (this.shouldReturnNotModified(context, document)) {
      return this.feedService.createNotModifiedResponse(document)
    }

    return this.feedService.createOkResponse(document)
  }

  private shouldReturnNotModified(context: Context, document: FeedDocument): boolean {
    const currentEtag = document.etag

    const ifNoneMatch = context.req.header('if-none-match')
    if (ifNoneMatch && this.matchesEtag(ifNoneMatch, currentEtag)) {
      return true
    }

    const lastModified = document.lastPublishedAt ?? document.generatedAt
    const ifModifiedSince = context.req.header('if-modified-since')
    if (ifModifiedSince && lastModified) {
      const sinceTime = Date.parse(ifModifiedSince)
      const lastModifiedTime = Date.parse(lastModified)
      if (!Number.isNaN(sinceTime) && !Number.isNaN(lastModifiedTime) && lastModifiedTime <= sinceTime) {
        return true
      }
    }

    return false
  }

  private matchesEtag(headerValue: string, currentEtag: string): boolean {
    const trimmed = headerValue.trim()
    if (trimmed === '*') {
      return true
    }

    const candidates = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

    return candidates.includes(currentEtag)
  }
}
