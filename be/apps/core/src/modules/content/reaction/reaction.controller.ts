import { Body, Controller, createZodSchemaDto, Get, Post, Query } from '@afilmory/framework'
import type { AnalysisResponse } from '@afilmory/sdk'
import { AnalysisDtoSchema, ReactionDtoSchema } from '@afilmory/sdk'

import { ReactionService } from './reaction.service'

class ReactionDto extends createZodSchemaDto(ReactionDtoSchema) {}

class AnalysisDto extends createZodSchemaDto(AnalysisDtoSchema) {}

@Controller('reactions')
export class ReactionController {
  constructor(private readonly reactionService: ReactionService) {}

  @Post('/add')
  async addReaction(@Body() body: ReactionDto) {
    const { refKey, reaction } = body

    await this.reactionService.addReaction(refKey, reaction)
  }

  @Get('/')
  async getReactions(@Query() query: AnalysisDto): Promise<AnalysisResponse> {
    return await this.reactionService.getReactionAnalysis(query.refKey)
  }

  @Get('/stats')
  async getReactionStats(@Query() query: AnalysisDto): Promise<Record<string, number>> {
    const analysis = await this.reactionService.getReactionAnalysis(query.refKey)
    return analysis.data.reactions
  }
}
