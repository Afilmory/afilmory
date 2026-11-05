export class Reader {
  position = 0
  constructor(readonly bytes: Uint8Array) {}
  uint(size: number) {
    if (size < 0 || size > 8 || this.position + size > this.bytes.length) {
      throw new Error('Truncated AVIF field')
    }
    let value = 0
    for (let i = 0; i < size; i++) {
      value = value * 256 + this.bytes[this.position++]
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('AVIF integer exceeds safe range')
    }
    return value
  }

  text(size: number) {
    return String.fromCharCode(...this.take(size))
  }

  take(size: number) {
    if (size < 0 || this.position + size > this.bytes.length) {
      throw new Error('Truncated AVIF data')
    }
    const result = this.bytes.subarray(this.position, this.position + size)
    this.position += size
    return result
  }
}
export type Box = { type: string, data: Uint8Array, raw: Uint8Array }
export function boxes(bytes: Uint8Array): Box[] {
  const reader = new Reader(bytes)
  const result: Box[] = []
  while (reader.position < bytes.length) {
    const start = reader.position
    let size = reader.uint(4)
    const type = reader.text(4)
    if (size === 1) {
      size = reader.uint(8)
    }
    if (size === 0) {
      size = bytes.length - start
    }
    if (size < reader.position - start) {
      throw new Error('Invalid AVIF box length')
    }
    const data = reader.take(size - (reader.position - start))
    if (result.length >= 4096) {
      throw new Error('Too many BMFF boxes')
    }
    result.push({ type, data, raw: bytes.subarray(start, start + size) })
  }
  return result
}
export function one(list: Box[], type: string) {
  const matches = list.filter(box => box.type === type)
  if (matches.length !== 1) {
    throw new Error(`Expected one AVIF ${type} box`)
  }
  return matches[0]
}
export const bytes = (...values: number[]) => new Uint8Array(values)
export const text = (value: string) => new TextEncoder().encode(value)
export function uint(value: number, size = 4) {
  const result = new Uint8Array(size)
  for (let i = size - 1; i >= 0; i--) {
    result[i] = value % 256
    value = Math.floor(value / 256)
  }
  if (value !== 0) {
    throw new Error('AVIF output integer overflow')
  }
  return result
}
export function join(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}
export function box(type: string, ...parts: Uint8Array[]) {
  const data = join(...parts)
  return join(uint(data.length + 8), text(type), data)
}
export function full(type: string, version: number, ...parts: Uint8Array[]) {
  return box(type, bytes(version, 0, 0, 0), ...parts)
}
