import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { Body, Controller, Get, HttpContext, Post } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { AccountDeletionImpactService } from './account-deletion-impact.service'
import { parseAccountDeletionProof } from './account-deletion-proof'
import { AccountDeletionRequestService } from './account-deletion-request.service'

@injectable()
// This domain endpoint must not sit below Better Auth's `/auth/*` passthrough.
@Controller('account-deletion')
export class AccountDeletionController {
  constructor(
    private readonly impact: AccountDeletionImpactService,
    private readonly requests: AccountDeletionRequestService,
  ) {}

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @RequireAuth()
  @Get('/impact')
  async getImpact() {
    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return await this.impact.build(authContext.user.id)
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @RequireAuth()
  @Post('/request')
  async requestDeletion(@Body() body: { proof?: unknown }) {
    const authContext = HttpContext.getValue('auth')
    if (!authContext?.user || !authContext.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const proof = parseAccountDeletionProof(body?.proof)
    if (!proof) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'A valid reauthentication proof is required.' })
    }
    return await this.requests.request({
      proof,
      sessionCreatedAt: authContext.session.createdAt,
      userId: authContext.user.id,
    })
  }

  @AllowPlaceholderTenant()
  @SkipTenantGuard()
  @Post('/status')
  async status(@Body() body: { requestId?: string, statusToken?: string }) {
    const requestId = body.requestId?.trim()
    const statusToken = body.statusToken?.trim()
    if (!requestId || !statusToken) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST)
    }
    return await this.requests.status(requestId, statusToken)
  }
}
