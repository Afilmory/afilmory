import { DbManager } from './db'

export const guardDbEnabled = <T extends (...args: any[]) => any>(fn: T): T => {
  // @ts-expect-error
  return async (...rest: any[]) => {
    if (!DbManager.shared.isEnabled()) {
      return new Response('Database is not enabled, the site owner has not configured the database.', { status: 500 })
    }

    await DbManager.shared.connect()

    return fn(...rest)
  }
}
