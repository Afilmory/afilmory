import type { Tags } from 'exiftool-vendored'

// 影调类型定义
export type ToneType = 'low-key' | 'high-key' | 'normal' | 'high-contrast'

// 压缩的直方图数据结构
export interface CompressedHistogramData {
  red: number[] // 64 个点位，降采样后的数据
  green: number[] // 64 个点位，降采样后的数据
  blue: number[] // 64 个点位，降采样后的数据
  luminance: number[] // 64 个点位，降采样后的数据
}

// 原始直方图数据结构（仅用于内部计算）
export interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

// 影调分析结果
export interface ToneAnalysis {
  toneType: ToneType
  brightness: number // 0-100，平均亮度
  contrast: number // 0-100，对比度
  shadowRatio: number // 0-1，阴影区域占比
  highlightRatio: number // 0-1，高光区域占比
}

export interface PhotoInfo {
  title: string
  dateTaken: string
  tags: string[]
  description: string
}

export interface ImageMetadata {
  width: number
  height: number
  format: string
}

export interface PhotoManifestItem extends PhotoInfo {
  id: string
  originalUrl: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: PickedExif | null
  toneAnalysis: ToneAnalysis | null // 影调分析结果
  isLivePhoto?: boolean
  isHDR?: boolean
  livePhotoVideoUrl?: string
  livePhotoVideoS3Key?: string
}

export interface ProcessPhotoResult {
  item: PhotoManifestItem | null
  type: 'processed' | 'skipped' | 'new' | 'failed'
}

export interface PickedExif {
  // 时区和时间相关
  zone?: string
  tz?: string
  tzSource?: string

  // 基本相机信息
  Orientation?: number
  Make?: string
  Model?: string
  Software?: string
  Artist?: string
  Copyright?: string

  // 曝光相关
  ExposureTime?: string | number
  FNumber?: number
  ExposureProgram?: string
  ISO?: number
  ShutterSpeedValue?: string | number
  ApertureValue?: number
  BrightnessValue?: number
  ExposureCompensation?: number
  MaxApertureValue?: number

  // 时间偏移
  OffsetTime?: string
  OffsetTimeOriginal?: string
  OffsetTimeDigitized?: string

  // 光源和闪光灯
  LightSource?: string
  Flash?: string

  // 焦距相关
  FocalLength?: string
  FocalLengthIn35mmFormat?: string

  // 镜头相关

  LensMake?: string
  LensModel?: string

  // 颜色和拍摄模式
  ColorSpace?: string

  ExposureMode?: string
  SceneCaptureType?: string

  // 计算字段
  Aperture?: number
  ScaleFactor35efl?: number
  ShutterSpeed?: string | number
  LightValue?: number

  // 日期时间（处理后的 ISO 格式）
  DateTimeOriginal?: string
  DateTimeDigitized?: string

  // 图像尺寸
  ImageWidth?: number
  ImageHeight?: number

  MeteringMode: Tags['MeteringMode']
  WhiteBalance: Tags['WhiteBalance']
  WBShiftAB: Tags['WBShiftAB']
  WBShiftGM: Tags['WBShiftGM']
  WhiteBalanceBias: Tags['WhiteBalanceBias']
  WhiteBalanceFineTune: Tags['WhiteBalanceFineTune']
  FlashMeteringMode: Tags['FlashMeteringMode']
  SensingMethod: Tags['SensingMethod']
  FocalPlaneXResolution: Tags['FocalPlaneXResolution']
  FocalPlaneYResolution: Tags['FocalPlaneYResolution']
  GPSAltitude: Tags['GPSAltitude']
  GPSLatitude: Tags['GPSLatitude']
  GPSLongitude: Tags['GPSLongitude']
  GPSAltitudeRef: Tags['GPSAltitudeRef']
  GPSLatitudeRef: Tags['GPSLatitudeRef']
  GPSLongitudeRef: Tags['GPSLongitudeRef']

  // 富士胶片配方
  FujiRecipe?: FujiRecipe

  // HDR 相关
  MPImageType?: Tags['MPImageType']
}

export interface ThumbnailResult {
  thumbnailUrl: string | null
  thumbnailBuffer: Buffer | null
  thumbHash: Uint8Array | null
}

export type FujiRecipe = {
  FilmMode:
    | 'F0/Standard (Provia)'
    | 'F1/Studio Portrait'
    | 'F1a/Studio Portrait Enhanced Saturation'
    | 'F1b/Studio Portrait Smooth Skin Tone (Astia)'
    | 'F1c/Studio Portrait Increased Sharpness'
    | 'F2/Fujichrome (Velvia)'
    | 'F3/Studio Portrait Ex'
    | 'F4/Velvia'
    | 'Pro Neg. Std'
    | 'Pro Neg. Hi'
    | 'Classic Chrome'
    | 'Eterna'
    | 'Classic Negative'
    | 'Bleach Bypass'
    | 'Nostalgic Neg'
    | 'Reala ACE'
  GrainEffectRoughness: 'Off' | 'Weak' | 'Strong'
  GrainEffectSize: 'Off' | 'Small' | 'Large'
  ColorChromeEffect: 'Off' | 'Weak' | 'Strong'
  ColorChromeFxBlue: 'Off' | 'Weak' | 'Strong'
  WhiteBalance:
    | 'Auto'
    | 'Auto (white priority)'
    | 'Auto (ambiance priority)'
    | 'Daylight'
    | 'Cloudy'
    | 'Daylight Fluorescent'
    | 'Day White Fluorescent'
    | 'White Fluorescent'
    | 'Warm White Fluorescent'
    | 'Living Room Warm White Fluorescent'
    | 'Incandescent'
    | 'Flash'
    | 'Underwater'
    | 'Custom'
    | 'Custom2'
    | 'Custom3'
    | 'Custom4'
    | 'Custom5'
    | 'Kelvin'
  /**
   * White balance fine tune adjustment (e.g., "Red +0, Blue +0")
   */
  WhiteBalanceFineTune: string
  DynamicRange: 'Standard' | 'Wide'
  /**
   * Highlight tone adjustment (e.g., "+2 (hard)", "0 (normal)", "-1 (medium soft)")
   */
  HighlightTone: string
  /**
   * Shadow tone adjustment (e.g., "-2 (soft)", "0 (normal)")
   */
  ShadowTone: string
  /**
   * Saturation adjustment (e.g., "+4 (highest)", "0 (normal)", "-2 (low)")
   */
  Saturation: string
  /**
   * Sharpness setting (e.g., "Normal", "Hard", "Soft")
   */
  Sharpness: string
  /**
   * Noise reduction setting (e.g., "0 (normal)", "-1 (medium weak)")
   */
  NoiseReduction: string
  /**
   * Clarity adjustment (typically 0)
   */
  Clarity: number
  /**
   * Color temperature setting (e.g., "5000", "6500")
   */
  ColorTemperature: Tags['ColorTemperature']
  /**
   * Development dynamic range setting (e.g., "100", "200")
   */
  DevelopmentDynamicRange: number
  /**
   * Dynamic range setting (e.g., Auto, Manual, Standard, Wide1, Wide2, Film Simulation)
   */
  DynamicRangeSetting: Tags['DynamicRangeSetting']
}

export type SonyRecipe = {
  /**
   * Adobe RGB
   * Real
   * Standard
   * Vivid
   * Portrait
   * Landscape
   * Sunset
   * Nightview
   * BW
   * Neutral
   * Clear
   * Deep
   * Light
   * Autumn Leaves
   * Sepia
   * VV2
   * FL
   * IN
   * SH
   */
  CreativeStyle: string

  /**
   *  Off
   *  Toy Camera
   *  Pop Color
   *  Posterization
   *  Posterization B/W
   *  Retro Photo
   *  Soft High Key
   *  Partial Color (red)
   *  Partial Color (green)
   *  Partial Color (blue)
   *  Partial Color (yellow)
   *  High Contrast Monochrome
   *  Toy Camera (normal)
   *  Toy Camera (cool)
   *  Toy Camera (warm)
   *  Toy Camera (green)
   *  Toy Camera (magenta)
   *  Soft Focus (low)
   *  Soft Focus
   *  Soft Focus (high)
   *  Miniature (auto)
   *  Miniature (top)
   *  Miniature (middle horizontal)
   *  Miniature (bottom)
   *  Miniature (left)
   *  Miniature (middle vertical)
   *  Miniature (right)
   *  HDR Painting (low)
   *  HDR Painting
   *  HDR Painting (high)
   *  Rich-tone Monochrome
   *  Water Color
   *  Water Color 2
   *  Illustration (low)
   *  Illustration
   *  Illustration (high)
   */
  PictureEffect: string

  /**
   * 0 => 'Off',
   * 1 => 'On',
   */
  Hdr: string

  /**
   * Off, Low, Mid, High
   */
  SoftSkinEffect: string
}
