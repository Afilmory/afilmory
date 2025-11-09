import { Module } from '@afilmory/framework'

import { DatabaseModule } from '../../database/database.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
