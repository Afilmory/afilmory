import 'dotenv/config'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default(process.env.NODE_ENV as any),
    PORT: z.string().regex(/^\d+$/).transform(Number).default(3000),
    WS_PORT: z.string().regex(/^\d+$/).transform(Number).default(3001),
    HOSTNAME: z.string().default('0.0.0.0'),
    API_KEY: z.string().min(1).optional(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    PG_POOL_MAX: z.string().regex(/^\d+$/).transform(Number).optional(),
    PG_IDLE_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).optional(),
    PG_CONN_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).optional(),
    // Optional social provider credentials for Better Auth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    CONFIG_ENCRYPTION_KEY: z.string().min(1),

    DEFAULT_SUPERADMIN_EMAIL: z.email().default('root@local.host'),
    DEFAULT_SUPERADMIN_USERNAME: z
      .string()
      .min(1)
      .regex(/^[\w-]+$/)
      .default('root'),

    // INTERNAL
    TEST: z.any().default(false),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export type NodeEnv = (typeof env)['NODE_ENV']
