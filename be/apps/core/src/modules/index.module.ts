import { APP_GUARD, APP_INTERCEPTOR, APP_MIDDLEWARE, EventModule, Module } from '@afilmory/framework'
import { AuthGuard } from 'core/guards/auth.guard'
import { PlaceholderTenantGuard } from 'core/guards/placeholder-tenant.guard'
import { RolesGuard } from 'core/guards/roles.guard'
import { TenantResolverInterceptor } from 'core/interceptors/tenant-resolver.interceptor'
import { CorsMiddleware } from 'core/middlewares/cors.middleware'
import { DatabaseContextMiddleware } from 'core/middlewares/database-context.middleware'
import { RequestContextMiddleware } from 'core/middlewares/request-context.middleware'
import { RedisAccessor } from 'core/redis/redis.provider'

import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { AppInitializationModule } from './app/app-initialization.module'
import { AppStateModule } from './app/app-state/app-state.module'
import { BuilderSettingModule } from './configuration/builder-setting/builder-setting.module'
import { SettingModule } from './configuration/setting/setting.module'
import { SiteSettingModule } from './configuration/site-setting/site-setting.module'
import { StorageSettingModule } from './configuration/storage-setting/storage-setting.module'
import { SystemSettingModule } from './configuration/system-setting/system-setting.module'
import { FeedModule } from './content/feed/feed.module'
import { OgModule } from './content/og/og.module'
import { PhotoModule } from './content/photo/photo.module'
import { ReactionModule } from './content/reaction/reaction.module'
import { CacheModule } from './infrastructure/cache/cache.module'
import { DataSyncModule } from './infrastructure/data-sync/data-sync.module'
import { HealthModule } from './infrastructure/health/health.module'
import { StaticWebModule } from './infrastructure/static-web/static-web.module'
import { AuthModule } from './platform/auth/auth.module'
import { BillingModule } from './platform/billing/billing.module'
import { DashboardModule } from './platform/dashboard/dashboard.module'
import { DataManagementModule } from './platform/data-management/data-management.module'
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
    HealthModule,
    SettingModule,
    BuilderSettingModule,
    StorageSettingModule,
    SiteSettingModule,
    SystemSettingModule,
    SuperAdminModule,
    PhotoModule,
    ReactionModule,
    DashboardModule,
    BillingModule,
    DataManagementModule,
    TenantModule,
    DataSyncModule,
    FeedModule,
    OgModule,
    AppInitializationModule,

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
      useClass: PlaceholderTenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantResolverInterceptor,
    },
  ],
})
export class AppModules {}
