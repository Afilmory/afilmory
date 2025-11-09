import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'

export const views = pgTable(
  'views',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    views: integer('views').notNull().default(0),
    refKey: varchar('ref_key', { length: 120 }).notNull().unique(),
  },
  (t) => [index('view_ref_key_idx').on(t.refKey)],
)
