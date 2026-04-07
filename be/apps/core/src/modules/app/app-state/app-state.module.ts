import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'

import { AppStateService } from './app-state.service'

@Module({
  imports: [DatabaseModule],
  providers: [AppStateService],
})
export class AppStateModule {}
