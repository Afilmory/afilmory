import http from 'node:http'
import https from 'node:https'

import type { S3ClientConfig } from '@aws-sdk/client-s3'
import { S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'

import type { S3Config } from '../storage/interfaces'

// 创建 S3 客户端
export function createS3Client(config: S3Config): S3Client {
  if (config.provider !== 's3') {
    throw new Error('Storage provider is not s3')
  }

  const { accessKeyId, secretAccessKey, endpoint, region } = config
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('accessKeyId and secretAccessKey are required')
  }

  const keepAlive = config.keepAlive ?? true
  const maxSockets = config.maxSockets ?? 64
  const connectionTimeout = config.connectionTimeoutMs ?? 5_000
  const socketTimeout = config.socketTimeoutMs ?? 30_000
  const maxAttempts = config.maxAttempts ?? 3
  const retryMode = (config.retryMode as S3ClientConfig['retryMode']) ?? 'standard'

  const httpAgent = new http.Agent({ keepAlive, maxSockets })
  const httpsAgent = new https.Agent({ keepAlive, maxSockets })

  const s3ClientConfig: S3ClientConfig = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // from https://github.com/aws/aws-sdk-js-v3/issues/6810
    // some non AWS services like backblaze or cloudflare don't expect the new headers
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    endpoint,
    requestHandler: new NodeHttpHandler({
      httpAgent,
      httpsAgent,
      connectionTimeout,
      socketTimeout,
    }),
    maxAttempts,
    retryMode,
  }

  return new S3Client(s3ClientConfig)
}
