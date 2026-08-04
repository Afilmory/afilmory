import 'reflect-metadata'

import { generateKeyPairSync } from 'node:crypto'

import { decodeProtectedHeader, jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'

import { AppleClientSecretService } from './apple-client-secret.service'
import type { AppleAuthOptions } from './auth.config'

describe('apple client-secret service', () => {
  it('signs a short-lived ES256 client secret with the required Apple claims', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const options: AppleAuthOptions = {
      appBundleIdentifier: 'app.afilmory',
      clientId: 'app.afilmory.web',
      keyId: 'APPLE_KEY_ID',
      privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      teamId: 'APPLE_TEAM_ID',
      webEnabled: true,
    }
    const service = new AppleClientSecretService()

    const token = await service.generate(options, options.appBundleIdentifier)
    const verified = await jwtVerify(token, publicKey, {
      audience: 'https://appleid.apple.com',
      issuer: options.teamId,
      subject: options.appBundleIdentifier,
    })

    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'ES256', kid: options.keyId })
    expect(verified.payload.exp! - verified.payload.iat!).toBe(5 * 60)
    await expect(service.generate(options, options.appBundleIdentifier)).resolves.toBe(token)
  })

  it('normalizes escaped newlines from deployment secrets', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const privateKeyWithEscapedNewlines = privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString()
      .replaceAll('\n', '\\n')
    const service = new AppleClientSecretService()

    await expect(
      service.generate({
        appBundleIdentifier: 'app.afilmory',
        clientId: 'app.afilmory',
        keyId: 'APPLE_KEY_ID',
        privateKey: privateKeyWithEscapedNewlines,
        teamId: 'APPLE_TEAM_ID',
        webEnabled: false,
      }),
    ).resolves.toEqual(expect.any(String))
  })
})
