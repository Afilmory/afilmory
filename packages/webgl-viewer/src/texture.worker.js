// @ts-nocheck
/// <reference lib="webworker" />

let originalImage = null

const TILE_SIZE = 512 // Must be same as in WebGLImageViewerEngine.ts

// 简化的 LOD 级别
const WORKER_SIMPLE_LOD_LEVELS = [
  { scale: 0.25 }, // 极低质量
  { scale: 0.5 }, // 低质量
  { scale: 1 }, // 正常质量
  { scale: 2 }, // 高质量
  { scale: 4 }, // 超高质量
]
/**
 *
 * @param {MessageEvent} e
 * @returns
 */
self.onmessage = async (e) => {
  const { type, payload } = e.data
  console.info('[Worker] Received message:', type, payload)

  switch (type) {
    case 'load-image': {
      const { url } = payload
      try {
        console.info('[Worker] Fetching image:', url)
        const response = await fetch(url, { mode: 'cors' })
        const blob = await response.blob()
        originalImage = await createImageBitmap(blob)

        console.info('[Worker] Image decoded, posting init-done')
        self.postMessage({ type: 'init-done' })

        // Create initial LOD texture
        const lodLevel = 1 // Initial LOD level
        const lodConfig = WORKER_SIMPLE_LOD_LEVELS[lodLevel]
        const finalWidth = Math.max(1, Math.round(originalImage.width * lodConfig.scale))
        const finalHeight = Math.max(1, Math.round(originalImage.height * lodConfig.scale))

        const initialLODBitmap = await createImageBitmap(originalImage, {
          resizeWidth: finalWidth,
          resizeHeight: finalHeight,
          resizeQuality: 'medium',
        })

        console.info('[Worker] Initial LOD created, posting image-loaded')
        self.postMessage(
          {
            type: 'image-loaded',
            payload: {
              imageBitmap: initialLODBitmap,
              imageWidth: originalImage.width,
              imageHeight: originalImage.height,
              lodLevel,
            },
          },
          [initialLODBitmap],
        )
      } catch (error) {
        console.error('[Worker] Error loading image:', error)
        self.postMessage({ type: 'load-error', payload: { error } })
      }
      break
    }
    case 'init': {
      originalImage = payload.imageBitmap
      self.postMessage({ type: 'init-done' })
      break
    }
    case 'create-tile': {
      if (!originalImage) {
        console.warn('Worker has not been initialized with an image.')
        return
      }

      const { x, y, lodLevel, lodConfig, imageWidth, imageHeight, key } = payload

      try {
        const { cols, rows } = getTileGridSize(imageWidth, imageHeight, lodLevel, lodConfig)

        // Calculate tile region in the original image
        const sourceWidth = imageWidth / cols
        const sourceHeight = imageHeight / rows // Assuming square tiles from a square grid on the image
        const sourceX = x * sourceWidth
        const sourceY = y * sourceHeight

        const actualSourceWidth = Math.min(sourceWidth, imageWidth - sourceX)
        const actualSourceHeight = Math.min(sourceHeight, imageHeight - sourceY)

        const targetWidth = Math.min(TILE_SIZE, Math.ceil(actualSourceWidth * lodConfig.scale))
        const targetHeight = Math.min(TILE_SIZE, Math.ceil(actualSourceHeight * lodConfig.scale))

        if (targetWidth <= 0 || targetHeight <= 0) {
          return
        }

        // Use OffscreenCanvas to draw the tile
        const canvas = new OffscreenCanvas(targetWidth, targetHeight)
        const ctx = canvas.getContext('2d')

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = lodConfig.scale >= 1 ? 'high' : 'medium'

        ctx.drawImage(
          originalImage,
          sourceX,
          sourceY,
          actualSourceWidth,
          actualSourceHeight,
          0,
          0,
          targetWidth,
          targetHeight,
        )

        const imageBitmap = canvas.transferToImageBitmap()
        self.postMessage({ type: 'tile-created', payload: { key, imageBitmap, lodLevel } }, [imageBitmap])
      } catch (error) {
        console.error('Error creating tile in worker:', error)
        self.postMessage({ type: 'tile-error', payload: { key, error } })
      }
      break
    }
  }
}

/**
 *
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} _lodLevel
 * @param {object} lodConfig
 * @returns
 */
function getTileGridSize(imageWidth, imageHeight, _lodLevel, lodConfig) {
  const scaledWidth = imageWidth * lodConfig.scale
  const scaledHeight = imageHeight * lodConfig.scale

  const cols = Math.ceil(scaledWidth / TILE_SIZE)
  const rows = Math.ceil(scaledHeight / TILE_SIZE)

  return { cols, rows }
}
