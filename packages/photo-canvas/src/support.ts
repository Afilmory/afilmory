let cached: boolean | null = null

export const isPhotoCanvasSupported = () => {
  if (cached !== null) {
    return cached
  }
  if (typeof document === 'undefined') {
    return false
  }
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    cached = context !== null
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  }
  catch {
    cached = false
  }
  return cached
}
