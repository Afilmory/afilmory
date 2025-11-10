import { Module } from '@afilmory/framework'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'

import { DataSyncController } from './data-sync.controller'
import { DataSyncService } from './data-sync.service'

@Module({
  controllers: [DataSyncController],
  providers: [DataSyncService, BuilderConfigService],
})
export class DataSyncModule {}
