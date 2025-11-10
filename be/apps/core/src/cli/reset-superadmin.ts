import { randomBytes } from 'node:crypto'

import { authAccounts, authSessions, authUsers, generateId } from '@afilmory/db'
import { env } from '@afilmory/env'
import { eq } from 'drizzle-orm'

import { createConfiguredApp } from '../app.factory'
import { DbAccessor, PgPoolProvider } from '../database/database.provider'
import { logger } from '../helpers/logger.helper'
import { AuthProvider } from '../modules/platform/auth/auth.provider'
import { RedisProvider } from '../redis/redis.provider'

const RESET_FLAG = '--reset-superadmin-password'
const PASSWORD_FLAG = '--password'
const EMAIL_FLAG = '--email'

export interface ResetCliOptions {
  password?: string
  email?: string
}

export function parseResetCliArgs(args: readonly string[]): ResetCliOptions | null {
  const hasResetFlag = args.some((arg) => arg === RESET_FLAG || arg.startsWith(`${RESET_FLAG}=`))
  if (!hasResetFlag) {
    return null
  }

  let password: string | undefined
  let email: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg || arg === '--') {
      continue
    }

    if (arg === RESET_FLAG) {
      continue
    }

    if (arg.startsWith(`${RESET_FLAG}=`)) {
      const inline = arg.slice(RESET_FLAG.length + 1).trim()
      if (inline.length > 0) {
        password = inline
      }
      continue
    }

    if (arg === PASSWORD_FLAG) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --password')
      }
      password = value
      index++
      continue
    }

    if (arg.startsWith(`${PASSWORD_FLAG}=`)) {
      const value = arg.slice(PASSWORD_FLAG.length + 1).trim()
      if (value.length === 0) {
        throw new Error('Missing value for --password')
      }
      password = value
      continue
    }

    if (arg === EMAIL_FLAG) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --email')
      }
      email = value
      index++
      continue
    }

    if (arg.startsWith(`${EMAIL_FLAG}=`)) {
      const value = arg.slice(EMAIL_FLAG.length + 1).trim()
      if (value.length === 0) {
        throw new Error('Missing value for --email')
      }
      email = value
    }
  }

  return { password, email }
}

function generateRandomPassword(): string {
  return randomBytes(16).toString('base64url')
}

export async function handleResetSuperAdminPassword(options: ResetCliOptions): Promise<void> {
  const app = await createConfiguredApp({
    globalPrefix: '/api',
  })

  const container = app.getContainer()
  const poolProvider = container.resolve(PgPoolProvider)
  const redisProvider = container.resolve(RedisProvider)
  const authProvider = container.resolve(AuthProvider)
  const dbAccessor = container.resolve(DbAccessor)

  try {
    const auth = await authProvider.getAuth()
    const context = await auth.$context
    const rawPassword = options.password ?? generateRandomPassword()
    const { minPasswordLength, maxPasswordLength } = context.password.config

    if (rawPassword.length < minPasswordLength || rawPassword.length > maxPasswordLength) {
      throw new Error(`Password must be between ${minPasswordLength} and ${maxPasswordLength} characters.`)
    }

    const hashedPassword = await context.password.hash(rawPassword)
    const db = dbAccessor.get()

    const targetEmail = options.email ?? env.DEFAULT_SUPERADMIN_EMAIL
    const now = new Date().toISOString()
    let resolvedEmail = targetEmail
    let revokedSessionsCount = 0
    let credentialAccountCreated = false

    await db.transaction(async (tx) => {
      let superAdmin = await tx.query.authUsers.findFirst({
        where: (users, { eq }) => eq(users.email, targetEmail),
      })

      if (!superAdmin) {
        superAdmin = await tx.query.authUsers.findFirst({
          where: (users, { eq }) => eq(users.role, 'superadmin'),
        })
      }

      if (!superAdmin) {
        const message = options.email
          ? `No superadmin account found for email "${options.email}"`
          : 'No superadmin account found'
        throw new Error(message)
      }

      resolvedEmail = superAdmin.email

      const credentialAccount = await tx.query.authAccounts.findFirst({
        where: (accounts, { eq, and }) =>
          and(eq(accounts.userId, superAdmin.id), eq(accounts.providerId, 'credential')),
      })

      if (credentialAccount) {
        await tx
          .update(authAccounts)
          .set({ password: hashedPassword, updatedAt: now })
          .where(eq(authAccounts.id, credentialAccount.id))
      } else {
        credentialAccountCreated = true
        await tx.insert(authAccounts).values({
          id: generateId(),
          accountId: superAdmin.id,
          providerId: 'credential',
          userId: superAdmin.id,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        })
      }

      await tx.update(authUsers).set({ updatedAt: now }).where(eq(authUsers.id, superAdmin.id))

      const deletedSessions = await tx
        .delete(authSessions)
        .where(eq(authSessions.userId, superAdmin.id))
        .returning({ id: authSessions.id })

      revokedSessionsCount = deletedSessions.length
    })

    logger.info(
      `Superadmin password reset for ${resolvedEmail}. ${credentialAccountCreated ? 'Credential account created.' : 'Credential account updated.'} Revoked ${revokedSessionsCount} sessions.`,
    )

    process.stdout.write(`Superadmin credentials reset\n  email: ${resolvedEmail}\n  password: ${rawPassword}\n`)
  } finally {
    await app.close('cli')

    try {
      const pool = poolProvider.getPool()
      await pool.end()
    } catch (error) {
      logger.warn(`Failed to close PostgreSQL pool cleanly: ${String(error)}`)
    }

    try {
      const redis = redisProvider.getClient()
      redis.disconnect()
    } catch (error) {
      logger.warn(`Failed to disconnect Redis client cleanly: ${String(error)}`)
    }
  }
}
