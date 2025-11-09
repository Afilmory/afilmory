export const compressUint8Array = (uint8Array: Uint8Array) => {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const decompressUint8Array = (compressed: string) => {
  return Uint8Array.from(compressed.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
}
