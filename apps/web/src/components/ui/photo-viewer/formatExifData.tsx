import type { FujiRecipe, PickedExif } from '@afilmory/builder'
import { EllipsisHorizontalTextWithTooltip } from '@afilmory/ui'
import type { FC } from 'react'

import { i18nAtom } from '~/i18n'
import { jotaiStore } from '~/lib/jotai'

// Helper function to clean up EXIF values by removing unnecessary characters
const cleanExifValue = (value: string | null | undefined): string | null => {
  if (!value) return null

  // Remove parenthetical descriptions like "(medium soft)" from "-1 (medium soft)"
  const cleaned = value.toString().replace(/\s*\([^)]*\)$/, '')

  return cleaned.trim() || null
}

// Helper function to get translation key for EXIF values
const getTranslationKey = (category: string, value: string | number | null): string | null => {
  if (value === null || value === undefined) return null

  const normalizedValue = String(value)
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^\w.-]/g, '')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

  return `exif.${category}.${normalizedValue}`
}

// Translation functions for different EXIF categories
const translateExifValue = (
  category: string,
  value: string | number | null,
  props?: Record<string, string | number>,
): string | null => {
  if (!value) return null

  const i18n = jotaiStore.get(i18nAtom)
  const translationKey = getTranslationKey(category, value)

  if (!translationKey) return cleanExifValue(String(value))

  // Try to get translation, fallback to cleaned original value
  const cleanedValue = cleanExifValue(String(value))
  if (!i18n.exists(translationKey)) {
    return cleanedValue
  }

  const translated = i18n.t(translationKey as any, props)
  return translated || cleanedValue
}

const createTranslator =
  (category: string) =>
  (value: string | number | null, props?: Record<string, string | number>): string | null => {
    if (value === null || value === undefined) return null
    return translateExifValue(category, value, props)
  }

// Specific translation functions for different EXIF fields
const translateExposureMode = createTranslator('exposure.mode')
const translateMeteringMode = createTranslator('metering.mode')
const translateWhiteBalance = createTranslator('white.balance')
const translateFlash = createTranslator('flash')
const translateLightSource = createTranslator('light.source')
const translateSensingMethod = createTranslator('sensing.method')
const translateColorSpace = createTranslator('colorspace')
const translateExposureProgram = createTranslator('exposureprogram')

const translateFujiGrainEffectRoughness = createTranslator('fujirecipe-graineffectroughness')
const translateFujiGrainEffectSize = createTranslator('fujirecipe-graineffectsize')
const translateFujiColorChromeEffect = createTranslator('fujirecipe-colorchromeeffect')
const translateFujiColorChromeFxBlue = createTranslator('fujirecipe-colorchromefxblue')
const translateFujiDynamicRange = createTranslator('fujirecipe-dynamicrange')
const translateFujiSharpness = createTranslator('fujirecipe-sharpness')
const translateFujiWhiteBalance = createTranslator('fujirecipe-whitebalance')

// 场景捕获类型翻译
const translateSceneCaptureType = createTranslator('scene.capture.type')

// 翻译白平衡偏移字段中的 Red 和 Blue
const translateWhiteBalanceFineTune = (value: string | null): string | null => {
  if (!value) return null

  const i18n = jotaiStore.get(i18nAtom)
  const redTranslation = i18n.t('exif.white.balance.red')
  const blueTranslation = i18n.t('exif.white.balance.blue')

  // 替换 Red 和 Blue 文本，保持数值和符号不变
  return value.replaceAll(/\bRed\b/g, redTranslation).replaceAll(/\bBlue\b/g, blueTranslation)
}

// Helper function to process Fuji Recipe values and clean them
const processFujiRecipeValue = (value: string | null | undefined): string | null => {
  return cleanExifValue(value)
}

// Process entire Fuji Recipe object
const processFujiRecipe = (recipe: FujiRecipe): any => {
  if (!recipe) return null

  const processed = { ...recipe } as any

  // Clean specific fields that commonly have unnecessary characters
  if (recipe.HighlightTone) {
    processed.HighlightTone = processFujiRecipeValue(recipe.HighlightTone)
  }
  if (recipe.ShadowTone) {
    processed.ShadowTone = processFujiRecipeValue(recipe.ShadowTone)
  }
  if (recipe.Saturation) {
    processed.Saturation = processFujiRecipeValue(recipe.Saturation)
  }
  if (recipe.NoiseReduction) {
    processed.NoiseReduction = processFujiRecipeValue(recipe.NoiseReduction)
  }
  if (recipe.FilmMode) {
    processed.FilmMode = mapReadableFilmMode(recipe.FilmMode)
  }

  if (recipe.GrainEffectRoughness) {
    processed.GrainEffectRoughness = translateFujiGrainEffectRoughness(recipe.GrainEffectRoughness)
  }
  if (recipe.GrainEffectSize) {
    processed.GrainEffectSize = translateFujiGrainEffectSize(recipe.GrainEffectSize)
  }
  if (recipe.ColorChromeEffect) {
    processed.ColorChromeEffect = translateFujiColorChromeEffect(recipe.ColorChromeEffect)
  }
  if (recipe.ColorChromeFxBlue) {
    processed.ColorChromeFxBlue = translateFujiColorChromeFxBlue(recipe.ColorChromeFxBlue)
  }
  if (recipe.DynamicRange) {
    processed.DynamicRange = translateFujiDynamicRange(recipe.DynamicRange)
  }

  if (recipe.DynamicRangeSetting) {
    if (recipe.DynamicRangeSetting === 'Manual') {
      processed.DynamicRange = `DR${recipe.DevelopmentDynamicRange}`
    } else {
      processed.DynamicRange = 'Auto'
    }
  }

  if (recipe.Sharpness) {
    processed.Sharpness = translateFujiSharpness(recipe.Sharpness)
  }
  if (recipe.WhiteBalance) {
    if (recipe.ColorTemperature && recipe.WhiteBalance === 'Kelvin') {
      processed.WhiteBalance = translateFujiWhiteBalance('Kelvin', {
        kelvin: recipe.ColorTemperature,
      })
    } else {
      processed.WhiteBalance = translateFujiWhiteBalance('Auto')
    }
  }
  if (recipe.WhiteBalanceFineTune) {
    processed.WhiteBalanceFineTune = translateWhiteBalanceFineTune(recipe.WhiteBalanceFineTune)
  }

  return processed
}

export const formatExifData = (exif: PickedExif | null) => {
  if (!exif) return null

  // 时区和时间相关
  const zone = exif.zone || exif.tz || null

  const tzSource = exif.tzSource || null

  // 等效焦距 (35mm)
  const focalLength35mm = exif.FocalLengthIn35mmFormat ? Number.parseInt(exif.FocalLengthIn35mmFormat) : null

  // 实际焦距
  const focalLength = exif.FocalLength ? Number.parseInt(exif.FocalLength) : null

  // ISO
  const iso = exif.ISO

  // 快门速度
  const exposureTime = exif.ExposureTime
  const shutterSpeed = exposureTime ? `${exposureTime}s` : exif.ShutterSpeedValue ? `${exif.ShutterSpeedValue}s` : null

  // 光圈
  const aperture = exif.FNumber ? `f/${exif.FNumber}` : null

  // 最大光圈
  const maxAperture = exif.MaxApertureValue

  // 相机信息
  const camera = exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : null

  // 镜头信息 - 包含制造商
  const lens = (() => {
    if (exif.LensMake && exif.LensModel) {
      return `${exif.LensMake} ${exif.LensModel}`
    }
    return exif.LensModel || null
  })()

  // 镜头制造商
  const lensMake = exif.LensMake || null

  // 软件信息
  const software = exif.Software || null

  // 艺术家/作者信息
  const artist = exif.Artist || null

  // 版权信息
  const copyright = exif.Copyright || null

  // 图像方向
  const orientation = exif.Orientation || null

  // 拍摄时间
  const dateTime: string | null = (() => {
    return formatDateTime(new Date(exif.DateTimeOriginal || ''))
  })()

  // 数字化时间
  const dateTimeDigitized: string | null = (() => {
    if (!exif.DateTimeDigitized) return null
    return formatDateTime(new Date(exif.DateTimeDigitized))
  })()

  // 时间偏移
  const offsetTime = exif.OffsetTime || null
  const offsetTimeOriginal = exif.OffsetTimeOriginal || null
  const offsetTimeDigitized = exif.OffsetTimeDigitized || null

  // 曝光模式 - with translation
  const exposureMode = translateExposureMode(exif.ExposureMode || null)

  // 测光模式 - with translation
  const meteringMode = translateMeteringMode(exif.MeteringMode || null)

  // 白平衡 - with translation
  const whiteBalance = translateWhiteBalance(exif.WhiteBalance || null)

  // 闪光灯 - with translation
  const flash = translateFlash(exif.Flash || null)

  // 闪光灯测光模式
  const flashMeteringMode = exif.FlashMeteringMode || null

  // 场景捕获类型 - with translation
  const sceneCaptureType = translateSceneCaptureType(exif.SceneCaptureType || null)

  // 曝光补偿
  const exposureBias = exif.ExposureCompensation ? `${exif.ExposureCompensation} EV` : null

  // 亮度值
  const brightnessValue = exif.BrightnessValue ? `${exif.BrightnessValue.toFixed(1)} EV` : null

  // 快门速度值
  const shutterSpeedValue = exif.ShutterSpeedValue

  // 光圈值
  const apertureValue = exif.ApertureValue ? `${exif.ApertureValue.toFixed(1)} EV` : null

  // 光源类型 - with translation
  const lightSource = translateLightSource(exif.LightSource || null)

  // 白平衡偏移/微调相关字段
  const whiteBalanceBias = exif.WhiteBalanceBias || null
  const wbShiftAB = exif.WBShiftAB || null
  const wbShiftGM = exif.WBShiftGM || null

  // 感光方法
  const sensingMethod = translateSensingMethod(exif.SensingMethod || null)

  // 焦平面分辨率
  const focalPlaneXResolution = exif.FocalPlaneXResolution ? Math.round(exif.FocalPlaneXResolution) : null
  const focalPlaneYResolution = exif.FocalPlaneYResolution ? Math.round(exif.FocalPlaneYResolution) : null

  // 色彩空间 - with translation
  const colorSpace = translateColorSpace(exif.ColorSpace || null)

  // 评分
  const rating = exif.Rating

  const GPSAltitudeIsAboveSeaLevel = exif.GPSAltitudeRef === 'Above Sea Level'

  // GPS 信息
  const gpsInfo = {
    altitude: exif.GPSAltitude ? `${GPSAltitudeIsAboveSeaLevel ? '' : '-'}${exif.GPSAltitude}` : null,
    latitude: exif.GPSLatitude ? `${exif.GPSLatitude}° ${exif.GPSLatitudeRef}` : null,
    longitude: exif.GPSLongitude ? `${exif.GPSLongitude}° ${exif.GPSLongitudeRef}` : null,
  }

  const exposureProgram = translateExposureProgram(exif.ExposureProgram || null)

  return {
    // 时区和时间相关
    zone,

    tzSource,

    // 基本信息
    focalLength35mm,
    focalLength,
    iso,
    shutterSpeed,
    aperture,
    maxAperture,
    camera,
    lens,
    lensMake,
    software,
    artist,
    copyright,
    orientation,
    dateTime,
    dateTimeDigitized,

    // 时间偏移
    offsetTime,
    offsetTimeOriginal,
    offsetTimeDigitized,

    // 拍摄模式
    exposureMode,
    meteringMode,
    whiteBalance,
    flash,
    flashMeteringMode,
    sceneCaptureType,
    colorSpace,

    // 曝光参数
    exposureBias,
    brightnessValue,
    shutterSpeedValue,
    apertureValue,
    lightSource,
    sensingMethod,

    focalPlaneXResolution,
    focalPlaneYResolution,

    whiteBalanceBias,
    wbShiftAB,
    wbShiftGM,

    // GPS 信息
    gps: gpsInfo.latitude && gpsInfo.longitude ? gpsInfo : null,

    fujiRecipe: exif.FujiRecipe ? processFujiRecipe(exif.FujiRecipe) : null,
    exposureProgram,
    rating,
  }
}

export const Row: FC<{
  label: string
  value: string | number | null | undefined | number[]
  ellipsis?: boolean
}> = ({ label, value, ellipsis = false }) => {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-text-secondary shrink-0">{label}</span>
      {ellipsis ? (
        <span className="relative min-w-0 flex-1 shrink">
          <span className="absolute inset-0">
            <EllipsisHorizontalTextWithTooltip className="text-text min-w-0 text-right">
              {Array.isArray(value) ? value.join(' ') : value}
            </EllipsisHorizontalTextWithTooltip>
          </span>
        </span>
      ) : (
        <span className="text-text min-w-0 text-right">{Array.isArray(value) ? value.join(' ') : value}</span>
      )}
    </div>
  )
}

const formatDateTime = (date: Date | null | undefined) => {
  if (!date || Number.isNaN(date.getTime())) return ''
  const i18n = jotaiStore.get(i18nAtom)
  const datetimeFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'medium',
  })

  return datetimeFormatter.format(date)
}

const mapReadableFilmMode = (filmMode: string) => {
  switch (filmMode) {
    case 'F0/Standard (Provia)': {
      return 'Provia'
    }

    case 'F1b/Studio Portrait Smooth Skin Tone (Astia)': {
      return 'Astia'
    }

    case 'F2/Fujichrome (Velvia)': {
      return 'Velvia'
    }

    case 'F4/Velvia': {
      return 'Velvia'
    }

    default: {
      return filmMode
    }
  }
}
