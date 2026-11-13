export const loadThumbnail = async (
  url: string,
  aspectRatio: number,
  tier: number,
  signal: AbortSignal,
): Promise<ImageBitmap> => {
  const response = await fetch(url, { mode: 'cors', signal })
  if (!response.ok) {
    throw new Error(`thumbnail request failed with ${response.status}`)
  }
  const blob = await response.blob()
  signal.throwIfAborted()
  const resize = aspectRatio >= 1 ? { resizeWidth: tier } : { resizeHeight: tier }
  return createImageBitmap(blob, { ...resize, resizeQuality: 'medium' })
}
