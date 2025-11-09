import { APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, EventModule, Module } from '@afilmory/framework'
import { AuthGuard } from 'core/guards/auth.guard'
import { TenantResolverInterceptor } from 'core/interceptors/tenant-resolver.interceptor'
import { CorsMiddleware } from 'core/middlewares/cors.middleware'
import { DatabaseContextMiddleware } from 'core/middlewares/database-context.middleware'
import { RedisAccessor } from 'core/redis/redis.provider'

import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { AuthModule } from './auth/auth.module'
import { CacheModule } from './cache/cache.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { DataSyncModule } from './data-sync/data-sync.module'
import { FeedModule } from './feed/feed.module'
import { OgModule } from './og/og.module'
import { OnboardingModule } from './onboarding/onboarding.module'
import { PhotoModule } from './photo/photo.module'
import { ReactionModule } from './reaction/reaction.module'
import { SettingModule } from './setting/setting.module'
import { SiteSettingModule } from './site-setting/site-setting.module'
import { StaticWebModule } from './static-web/static-web.module'
import { StorageSettingModule } from './storage-setting/storage-setting.module'
import { SuperAdminModule } from './super-admin/super-admin.module'
import { SystemSettingModule } from './system-setting/system-setting.module'
import { TenantModule } from './tenant/tenant.module'

function createEventModuleOptions(redis: RedisAccessor) {
  return {
    redisClient: redis.get(),
  }
}

@Module({
  imports: [
    DatabaseModule,
    EventModule.forRootAsync({
      useFactory: createEventModuleOptions,
      inject: [RedisAccessor],
    }),
    RedisModule,
    AuthModule,
    CacheModule,
    SettingModule,
    StorageSettingModule,
    SiteSettingModule,
    SystemSettingModule,
    SuperAdminModule,
    OnboardingModule,
    PhotoModule,
    ReactionModule,
    DashboardModule,
    TenantModule,
    DataSyncModule,
    FeedModule,
    OgModule,

    // This must be last
    StaticWebModule,
  ],
  providers: [
    {
      provide: APP_MIDDLEWARE,
      useClass: CorsMiddleware,
    },
    {
      provide: APP_MIDDLEWARE,
      useClass: DatabaseContextMiddleware,
    },

    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantResolverInterceptor,
    },
  ],
})
export class AppModules {}
