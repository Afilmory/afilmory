import type { StorageManager } from '../storage/index.js'
import type { StorageObject } from '../storage/interfaces.js'
import type { S3ObjectLike } from '../types/s3.js'
import { getGlobalLoggers } from './logger-adapter.js'

export interface ThreeDSceneResult {
  hasScene: boolean
  sceneUrl?: string
  sceneS3Key?: string
  mode?: 'sog'
}

export async function processThreeDScene(
  photoKey: string,
  threeDSceneMap: Map<string, S3ObjectLike | StorageObject>,
  storageManager: StorageManager,
): Promise<ThreeDSceneResult> {
  const loggers = getGlobalLoggers()
  const sceneObject = threeDSceneMap.get(photoKey)

  if (!sceneObject) {
    return { hasScene: false }
  }

  let sceneKey: string | undefined
  if ('Key' in sceneObject && typeof sceneObject.Key === 'string') {
    sceneKey = sceneObject.Key
  } else if ('key' in sceneObject && typeof sceneObject.key === 'string') {
    sceneKey = sceneObject.key
  }

  if (!sceneKey) {
    return { hasScene: false }
  }

  const sceneUrl = await storageManager.generatePublicUrl(sceneKey)
  loggers.image.info(`🌀 检测到 3D 场景：${photoKey} -> ${sceneKey}`)

  return {
    hasScene: true,
    sceneUrl,
    sceneS3Key: sceneKey,
    mode: 'sog',
  }
}
