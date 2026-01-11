type CameraIntrinsics = {
  fx: number
  fy: number
  cx: number
  cy: number
  imageWidth: number
  imageHeight: number
}

export type CameraMetadata = {
  intrinsics: CameraIntrinsics
  extrinsicCv: number[]
  colorSpaceIndex?: number
  headerComments?: string[]
}

const toExtrinsic4x4RowMajor = (raw?: number[] | Float32Array | null): number[] => {
  if (!raw) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  }

  const values = Array.from(raw)

  if (values.length === 16) return values

  if (values.length === 12) {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    m[0] = values[0]
    m[1] = values[1]
    m[2] = values[2]
    m[3] = values[3]

    m[4] = values[4]
    m[5] = values[5]
    m[6] = values[6]
    m[7] = values[7]

    m[8] = values[8]
    m[9] = values[9]
    m[10] = values[10]
    m[11] = values[11]

    const r00 = m[0]
    const r01 = m[1]
    const r02 = m[2]
    const r10 = m[4]
    const r11 = m[5]
    const r12 = m[6]
    const r20 = m[8]
    const r21 = m[9]
    const r22 = m[10]

    m[0] = r00
    m[1] = r10
    m[2] = r20
    m[4] = r01
    m[5] = r11
    m[6] = r21
    m[8] = r02
    m[9] = r12
    m[10] = r22

    return m
  }

  throw new Error(`Unrecognized extrinsic element length: ${values.length}`)
}

const parseIntrinsics = (raw: number[] | Float32Array | undefined, imageWidth?: number, imageHeight?: number) => {
  if (!raw) return null
  const values = Array.from(raw)

  if (values.length === 9) {
    if (!(typeof imageWidth === 'number' && Number.isFinite(imageWidth))) return null
    if (!(typeof imageHeight === 'number' && Number.isFinite(imageHeight))) return null
    const width = imageWidth
    const height = imageHeight
    return {
      fx: values[0],
      fy: values[4],
      cx: values[2],
      cy: values[5],
      imageWidth: width,
      imageHeight: height,
    }
  }

  if (values.length === 16) {
    if (!(typeof imageWidth === 'number' && Number.isFinite(imageWidth))) return null
    if (!(typeof imageHeight === 'number' && Number.isFinite(imageHeight))) return null
    const width = imageWidth
    const height = imageHeight
    return {
      fx: values[0],
      fy: values[5],
      cx: values[2],
      cy: values[6],
      imageWidth: width,
      imageHeight: height,
    }
  }

  if (values.length === 4) {
    const legacyWidth = Number.parseInt(`${values[2]}`)
    const legacyHeight = Number.parseInt(`${values[3]}`)
    const width = typeof imageWidth === 'number' && Number.isFinite(imageWidth) ? imageWidth : legacyWidth
    const height = typeof imageHeight === 'number' && Number.isFinite(imageHeight) ? imageHeight : legacyHeight
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return {
      fx: values[0],
      fy: values[1],
      cx: (width - 1) * 0.5,
      cy: (height - 1) * 0.5,
      imageWidth: width,
      imageHeight: height,
    }
  }

  return null
}

const normalizeColorSpaceIndex = (value: unknown) => {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? Number(value[0]) : undefined
  }
  return Number.isFinite(value as number) ? Number(value) : undefined
}

const buildCameraMetadata = (raw: Record<string, any> = {}): CameraMetadata | null => {
  const imageSize = raw.image_size
  const imageWidth = Array.isArray(imageSize) ? imageSize[0] : undefined
  const imageHeight = Array.isArray(imageSize) ? imageSize[1] : undefined
  const intrinsics = parseIntrinsics(raw.intrinsic, imageWidth, imageHeight)
  if (!intrinsics) return null

  return {
    intrinsics,
    extrinsicCv: toExtrinsic4x4RowMajor(raw.extrinsic),
    colorSpaceIndex: normalizeColorSpaceIndex(raw.color_space),
    headerComments: raw.headerComments ?? [],
  }
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50
const ZIP_CENTRAL_DIR_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50
const ZIP_END_OF_CENTRAL_DIR_MIN_SIZE = 22
const ZIP_MAX_COMMENT_SIZE = 0xffff

const textDecoder = new TextDecoder('utf-8')

const findZipEndOfCentralDir = (view: DataView, length: number) => {
  const start = Math.max(0, length - (ZIP_END_OF_CENTRAL_DIR_MIN_SIZE + ZIP_MAX_COMMENT_SIZE))
  for (let offset = length - ZIP_END_OF_CENTRAL_DIR_MIN_SIZE; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIR) return offset
  }
  return -1
}

const findZipEntry = (bytes: Uint8Array, targetName: string) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = bytes.byteLength
  const eocdOffset = findZipEndOfCentralDir(view, length)
  if (eocdOffset < 0) return null

  const centralDirSize = view.getUint32(eocdOffset + 12, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)
  const centralDirEnd = centralDirOffset + centralDirSize
  if (centralDirEnd > length) return null

  let offset = centralDirOffset
  while (offset + 46 <= centralDirEnd) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIR_HEADER) break

    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)

    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    const name = textDecoder.decode(bytes.subarray(nameStart, nameEnd))
    const entryName = name.split(/[\\/]/).pop()?.toLowerCase()

    if (entryName === targetName) {
      return {
        compression,
        compressedSize,
        localHeaderOffset,
      }
    }

    offset = nameEnd + extraLength + commentLength
  }

  return null
}

const inflateRaw = async (data: Uint8Array) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new TypeError('DecompressionStream is not available in this browser')
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

const readZipEntryData = async (
  bytes: Uint8Array,
  entry: { compression: number; compressedSize: number; localHeaderOffset: number },
) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerOffset = entry.localHeaderOffset
  if (headerOffset + 30 > bytes.byteLength) return null
  if (view.getUint32(headerOffset, true) !== ZIP_LOCAL_FILE_HEADER) return null

  const nameLength = view.getUint16(headerOffset + 26, true)
  const extraLength = view.getUint16(headerOffset + 28, true)
  const dataStart = headerOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > bytes.byteLength) return null

  const compressed = bytes.subarray(dataStart, dataEnd)
  if (entry.compression === 0) return compressed
  if (entry.compression === 8) return inflateRaw(compressed)

  throw new Error(`Unsupported zip compression method: ${entry.compression}`)
}

const readSogMetaJson = async (bytes: Uint8Array) => {
  const entry = findZipEntry(bytes, 'meta.json')
  if (!entry) return null
  const data = await readZipEntryData(bytes, entry)
  if (!data) return null
  return JSON.parse(textDecoder.decode(data))
}

export const readSogMetadata = async (bytes: Uint8Array) => {
  const meta = await readSogMetaJson(bytes)
  if (!meta || typeof meta !== 'object') return null
  const sharpMetadata = meta.sharp_metadata
  if (!sharpMetadata || typeof sharpMetadata !== 'object') return null
  return buildCameraMetadata(sharpMetadata)
}
