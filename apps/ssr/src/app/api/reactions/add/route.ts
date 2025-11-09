import type {AnalysisResponse} from '@afilmory/sdk';
import { AnalysisDtoSchema,  ReactionDtoSchema } from '@afilmory/sdk'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { guardDbEnabled } from '~/lib/api-guard'
import { DbManager } from '~/lib/db'
import { photoLoader } from '~/lib/photo-loader'
import { reactions } from '~/schemas'
import * as schemas from '~/schemas'

export const POST = guardDbEnabled(async (req: NextRequest) => {
  const { refKey, reaction } = ReactionDtoSchema.parse(await req.json())

  const photo = photoLoader.getPhoto(refKey)
  if (!photo) {
    return new Response("Can't add reaction to non-existing photo", {
      status: 400,
    })
  }
  const db = DbManager.shared.getDb()
  try {
    await db.insert(reactions).values({
      refKey,
      reaction,
    })
    return new Response('', { status: 201 })
  } catch (error) {
    console.error('Failed to add reaction:', error)
    return new Response('Failed to add reaction', { status: 500 })
  }
})

export const GET = guardDbEnabled(async (req: NextRequest): Promise<NextResponse<AnalysisResponse>> => {
  const db = DbManager.shared.getDb()
  const searchParams = req.nextUrl.searchParams.entries()

  const { refKey } = AnalysisDtoSchema.parse(Object.fromEntries(searchParams))

  const [views] = await db.select().from(schemas.views).where(eq(schemas.views.refKey, refKey))
  const reactions = await db.select().from(schemas.reactions).where(eq(schemas.reactions.refKey, refKey))

  return NextResponse.json({
    data: {
      view: views.views,
      reactions: reactions.reduce(
        (acc, reaction) => {
          acc[reaction.reaction] = (acc[reaction.reaction] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    },
  })
})
