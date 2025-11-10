import { Module } from '@afilmory/framework'

import { ReactionController } from './reaction.controller'
import { ReactionService } from './reaction.service'

@Module({
  controllers: [ReactionController],
  providers: [ReactionService],
})
export class ReactionModule {}
