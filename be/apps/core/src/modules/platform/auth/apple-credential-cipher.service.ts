import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { env } from '@afilmory/env'
import { injectable } from 'tsyringe'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'

@injectable()
export class AppleCredentialCipher {
  private readonly key = createHash('sha256').update(env.CONFIG_ENCRYPTION_KEY).digest()

  encrypt(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
  }

  decrypt(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.')
    if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
      throw new Error('Unsupported Apple credential envelope.')
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
  }
}
