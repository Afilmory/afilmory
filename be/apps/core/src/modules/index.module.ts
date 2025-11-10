import { APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, EventModule, Module } from '@afilmory/framework'
import { AuthGuard } from 'core/guards/auth.guard'
import { TenantResolverInterceptor } from 'core/interceptors/tenant-resolver.interceptor'
import { CorsMiddleware } from 'core/middlewares/cors.middleware'
import { DatabaseContextMiddleware } from 'core/middlewares/database-context.middleware'
import { RequestContextMiddleware } from 'core/middlewares/request-context.middleware'
import { RedisAccessor } from 'core/redis/redis.provider'

import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { BuilderSettingModule } from './configuration/builder-setting/builder-setting.module'
import { SettingModule } from './configuration/setting/setting.module'
import { SiteSettingModule } from './configuration/site-setting/site-setting.module'
import { StorageSettingModule } from './configuration/storage-setting/storage-setting.module'
import { SystemSettingModule } from './configuration/system-setting/system-setting.module'
import { FeedModule } from './content/feed/feed.module'
import { OgModule } from './content/og/og.module'
import { PhotoModule } from './content/photo/photo.module'
import { ReactionModule } from './content/reaction/reaction.module'
import { AppStateModule } from './infrastructure/app-state/app-state.module'
import { CacheModule } from './infrastructure/cache/cache.module'
import { DataSyncModule } from './infrastructure/data-sync/data-sync.module'
import { StaticWebModule } from './infrastructure/static-web/static-web.module'
import { AuthModule } from './platform/auth/auth.module'
import { DashboardModule } from './platform/dashboard/dashboard.module'
import { SuperAdminModule } from './platform/super-admin/super-admin.module'
import { TenantModule } from './platform/tenant/tenant.module'

function createEventModuleOptions(redis: RedisAccessor) {
  return {
    redisClient: redis.get(),
  }
}

@Module({
  imports: [
    DatabaseModule,
    AppStateModule,
    EventModule.forRootAsync({
      useFactory: createEventModuleOptions,
      inject: [RedisAccessor],
    }),
    RedisModule,
    AuthModule,
    CacheModule,
    SettingModule,
    BuilderSettingModule,
    StorageSettingModule,
    SiteSettingModule,
    SystemSettingModule,
    SuperAdminModule,
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
      useClass: RequestContextMiddleware,
    },
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
