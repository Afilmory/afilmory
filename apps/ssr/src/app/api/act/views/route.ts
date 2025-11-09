import { ViewDtoSchema } from '@afilmory/sdk'
import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { guardDbEnabled } from '~/lib/api-guard'
import { views } from '~/schemas'

import { DbManager } from '../../../../lib/db'

export const POST = guardDbEnabled(async (req: NextRequest) => {
  const { refKey } = ViewDtoSchema.parse(await req.json())

  const db = DbManager.shared.getDb()
  await db
    .insert(views)
    .values({
      refKey,
      views: 1,
    })
    .onConflictDoUpdate({
      target: views.refKey,
      set: {
        views: sql`${views.views} + 1`,
      },
    })
  return new Response('', { status: 201 })
})
