import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
import type { ModalComponent } from '@afilmory/ui'
import { LinearDivider, ScrollArea } from '@afilmory/ui'
import { DialogDescription, DialogHeader, DialogTitle } from '@afilmory/ui/modal/Dialog.jsx'
import { clsxm } from '@afilmory/utils'
import { useTranslation } from 'react-i18next'

type Section = {
  title: string
  rows: { label: string; value: string }[]
}

type PhotoExifDetailsModalProps = {
  manifest: PhotoManifestItem
}

const exifKeys = {
  headerFile: 'photos.library.exif.file',
  empty: 'photos.library.exif.empty',
  sections: {
    basic: 'photos.library.exif.sections.basic',
    capture: 'photos.library.exif.sections.capture',
    metadata: 'photos.library.exif.sections.metadata',
    location: 'photos.library.exif.sections.location',
    fuji: 'photos.library.exif.sections.fuji',
  },
  rows: {
    title: 'photos.library.exif.rows.title',
    photoId: 'photos.library.exif.rows.photo-id',
    capturedAt: 'photos.library.exif.rows.captured-at',
    resolution: 'photos.library.exif.rows.resolution',
    megapixels: 'photos.library.exif.rows.megapixels',
    fileSize: 'photos.library.exif.rows.file-size',
    fileFormat: 'photos.library.exif.rows.file-format',
    aspectRatio: 'photos.library.exif.rows.aspect-ratio',
    device: 'photos.library.exif.rows.device',
    lens: 'photos.library.exif.rows.lens',
    aperture: 'photos.library.exif.rows.aperture',
    shutter: 'photos.library.exif.rows.shutter',
    iso: 'photos.library.exif.rows.iso',
    exposureCompensation: 'photos.library.exif.rows.exposure-compensation',
    eqFocalLength: 'photos.library.exif.rows.eq-focal-length',
    focalLength: 'photos.library.exif.rows.focal-length',
    exposureProgram: 'photos.library.exif.rows.exposure-program',
    meteringMode: 'photos.library.exif.rows.metering-mode',
    whiteBalance: 'photos.library.exif.rows.white-balance',
    sceneType: 'photos.library.exif.rows.scene-type',
    flash: 'photos.library.exif.rows.flash',
    lightSource: 'photos.library.exif.rows.light-source',
    exposureMode: 'photos.library.exif.rows.exposure-mode',
    brightness: 'photos.library.exif.rows.brightness',
    scaleFactor: 'photos.library.exif.rows.scale-factor',
    sensor: 'photos.library.exif.rows.sensor',
    author: 'photos.library.exif.rows.author',
    copyright: 'photos.library.exif.rows.copyright',
    software: 'photos.library.exif.rows.software',
    rating: 'photos.library.exif.rows.rating',
    colorSpace: 'photos.library.exif.rows.color-space',
    timezone: 'photos.library.exif.rows.timezone',
    timezoneSource: 'photos.library.exif.rows.timezone-source',
    timeOffset: 'photos.library.exif.rows.time-offset',
    latitude: 'photos.library.exif.rows.latitude',
    longitude: 'photos.library.exif.rows.longitude',
    altitude: 'photos.library.exif.rows.altitude',
  },
  altitude: {
    above: 'photos.library.exif.rows.altitude-value',
    below: 'photos.library.exif.rows.altitude-below',
  },
} as const satisfies {
  headerFile: I18nKeys
  empty: I18nKeys
  sections: Record<'basic' | 'capture' | 'metadata' | 'location' | 'fuji', I18nKeys>
  rows: Record<
    | 'title'
    | 'photoId'
    | 'capturedAt'
    | 'resolution'
    | 'megapixels'
    | 'fileSize'
    | 'fileFormat'
    | 'aspectRatio'
    | 'device'
    | 'lens'
    | 'aperture'
    | 'shutter'
    | 'iso'
    | 'exposureCompensation'
    | 'eqFocalLength'
    | 'focalLength'
    | 'exposureProgram'
    | 'meteringMode'
    | 'whiteBalance'
    | 'sceneType'
    | 'flash'
    | 'lightSource'
    | 'exposureMode'
    | 'brightness'
    | 'scaleFactor'
    | 'sensor'
    | 'author'
    | 'copyright'
    | 'software'
    | 'rating'
    | 'colorSpace'
    | 'timezone'
    | 'timezoneSource'
    | 'timeOffset'
    | 'latitude'
    | 'longitude'
    | 'altitude',
    I18nKeys
  >
  altitude: Record<'above' | 'below', I18nKeys>
}

const candidateKeys = (key: string): string[] => {
  const variations = new Set<string>([
    key,
    key.toLowerCase(),
    key.toUpperCase(),
    key.charAt(0).toLowerCase() + key.slice(1),
    key.charAt(0).toUpperCase() + key.slice(1),
  ])
  return Array.from(variations)
}

const getExifValue = <T = unknown,>(exif: PickedExif | null, ...keys: string[]): T | null => {
  if (!exif) return null
  const record = exif
  for (const key of keys) {
    for (const candidate of candidateKeys(key)) {
      if (candidate in record) {
        const value = record[candidate]
        if (value !== undefined && value !== null && value !== '') {
          return value as T
        }
      }
    }
  }
  return null
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const formatFileSize = (size?: number | null): string | null => {
  if (!size || size <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** exponent
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

const formatShutterSpeed = (exif: PickedExif | null): string | null => {
  const source = getExifValue<number | string>(exif, 'ExposureTime', 'ShutterSpeedValue', 'ShutterSpeed')
  if (!source) return null
  if (typeof source === 'number') {
    if (source >= 1) {
      return `${source.toFixed(1).replace(/\\.0$/, '')}s`
    }
    const denominator = Math.round(1 / source)
    return `1/${denominator}s`
  }
  const stringified = String(source)
  return stringified.endsWith('s') ? stringified : `${stringified}s`
}

const formatAperture = (exif: PickedExif | null): string | null => {
  const value = getExifValue<number | string>(exif, 'FNumber', 'Aperture', 'ApertureValue', 'MaxApertureValue')
  if (value === null) return null
  const numeric = parseNumber(value)
  if (numeric === null) {
    const stringified = String(value)
    return stringified.startsWith('f/') ? stringified : `f/${stringified}`
  }
  return `f/${numeric.toFixed(1).replace(/\\.0$/, '')}`
}

const formatExposureCompensation = (value?: number | string | null): string | null => {
  if (value === undefined || value === null || value === '') return null
  const normalized = parseNumber(value)
  if (normalized === null) return String(value)
  const formatted = normalized === 0 ? '0' : normalized.toFixed(1).replace(/\\.0$/, '')
  return `${normalized > 0 ? '+' : ''}${formatted} EV`
}

const formatFocalLength = (source?: string | number | null): string | null => {
  if (!source && source !== 0) return null
  const value = String(source)
  if (/mm$/i.test(value)) return value
  const numeric = parseNumber(source)
  return numeric !== null ? `${numeric}mm` : value
}

const formatDateLabel = (value: string | null | undefined, locale: string): string | null => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
  } catch {
    return parsed.toLocaleString()
  }
}

const toReadableValue = (maybeValue: unknown): string | null => {
  if (maybeValue === null || maybeValue === undefined) return null
  if (Array.isArray(maybeValue)) return maybeValue.join(', ')
  return String(maybeValue)
}

const convertGPSToDecimal = (
  exif: PickedExif | null,
  t: (key: I18nKeys, options?: Record<string, unknown>) => string,
): { latitude: string; longitude: string; altitude?: string } | null => {
  const latitudeValue = getExifValue<number | string>(exif, 'GPSLatitude')
  const longitudeValue = getExifValue<number | string>(exif, 'GPSLongitude')
  if (latitudeValue === null || longitudeValue === null) return null
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const latitudeRef = getExifValue<string>(exif, 'GPSLatitudeRef')
  const longitudeRef = getExifValue<string>(exif, 'GPSLongitudeRef')
  const altitudeRaw = getExifValue<number | string>(exif, 'GPSAltitude')
  const altitudeRef = getExifValue<string>(exif, 'GPSAltitudeRef')
  const altitudeNumber = parseNumber(altitudeRaw)
  const altitudeValue =
    altitudeNumber !== null
      ? altitudeRef === 'Below Sea Level'
        ? t(exifKeys.altitude.below, { value: altitudeNumber })
        : t(exifKeys.altitude.above, { value: altitudeNumber })
      : null

  return {
    latitude: `${latitude.toFixed(5)}° ${latitudeRef === 'S' || latitudeRef === 'South' ? 'S' : 'N'}`,
    longitude: `${longitude.toFixed(5)}° ${longitudeRef === 'W' || longitudeRef === 'West' ? 'W' : 'E'}`,
    altitude: altitudeValue ?? undefined,
  }
}

const getFormatLabel = (manifest: PhotoManifestItem): string | null => {
  const source = manifest.originalUrl || manifest.s3Key
  if (!source) return null
  const cleanPath = source.split(/[?#]/)[0]
  const parts = cleanPath.split('.')
  if (parts.length <= 1) return null
  return parts.pop()?.toUpperCase() ?? null
}

const buildSections = (
  manifest: PhotoManifestItem,
  t: (key: I18nKeys, options?: Record<string, unknown>) => string,
  locale: string,
): Section[] => {
  const { exif } = manifest
  const sections: Section[] = []

  const basicRows = [
    { label: t(exifKeys.rows.title), value: manifest.title || manifest.id },
    { label: t(exifKeys.rows.photoId), value: manifest.id },
    {
      label: t(exifKeys.rows.capturedAt),
      value: formatDateLabel(getExifValue<string>(exif, 'DateTimeOriginal') ?? manifest.dateTaken, locale),
    },
    { label: t(exifKeys.rows.resolution), value: `${manifest.width} × ${manifest.height}` },
    { label: t(exifKeys.rows.megapixels), value: `${Math.round((manifest.width * manifest.height) / 1_000_000)} MP` },
    { label: t(exifKeys.rows.fileSize), value: formatFileSize(manifest.size) },
    { label: t(exifKeys.rows.fileFormat), value: getFormatLabel(manifest) },
    { label: t(exifKeys.rows.aspectRatio), value: manifest.aspectRatio ? manifest.aspectRatio.toFixed(2) : null },
  ].filter((row) => row.value)

  if (basicRows.length > 0) {
    sections.push({ title: t(exifKeys.sections.basic), rows: basicRows as Section['rows'] })
  }

  const captureRows = [
    {
      label: t(exifKeys.rows.device),
      value: (() => {
        const make = getExifValue<string>(exif, 'Make')
        const model = getExifValue<string>(exif, 'Model')
        return make || model ? [make, model].filter(Boolean).join(' ') : null
      })(),
    },
    {
      label: t(exifKeys.rows.lens),
      value: (() => {
        const lensMake = getExifValue<string>(exif, 'LensMake')
        const lensModel = getExifValue<string>(exif, 'LensModel')
        return lensMake || lensModel ? [lensMake, lensModel].filter(Boolean).join(' ') : null
      })(),
    },
    { label: t(exifKeys.rows.aperture), value: formatAperture(exif) },
    { label: t(exifKeys.rows.shutter), value: formatShutterSpeed(exif) },
    {
      label: t(exifKeys.rows.iso),
      value: (() => {
        const iso = getExifValue<number | string>(exif, 'ISO')
        return iso ? `ISO ${iso}` : null
      })(),
    },
    {
      label: t(exifKeys.rows.exposureCompensation),
      value: formatExposureCompensation(getExifValue(exif, 'ExposureCompensation')),
    },
    { label: t(exifKeys.rows.eqFocalLength), value: formatFocalLength(getExifValue(exif, 'FocalLengthIn35mmFormat')) },
    { label: t(exifKeys.rows.focalLength), value: formatFocalLength(getExifValue(exif, 'FocalLength')) },
    { label: t(exifKeys.rows.exposureProgram), value: toReadableValue(getExifValue(exif, 'ExposureProgram')) },
    { label: t(exifKeys.rows.meteringMode), value: toReadableValue(getExifValue(exif, 'MeteringMode')) },
    { label: t(exifKeys.rows.whiteBalance), value: toReadableValue(getExifValue(exif, 'WhiteBalance')) },
    { label: t(exifKeys.rows.sceneType), value: toReadableValue(getExifValue(exif, 'SceneCaptureType')) },
    { label: t(exifKeys.rows.flash), value: toReadableValue(getExifValue(exif, 'Flash')) },
    { label: t(exifKeys.rows.lightSource), value: toReadableValue(getExifValue(exif, 'LightSource')) },
    { label: t(exifKeys.rows.exposureMode), value: toReadableValue(getExifValue(exif, 'ExposureMode')) },
    {
      label: t(exifKeys.rows.brightness),
      value: (() => {
        const brightness = getExifValue<number | string>(exif, 'BrightnessValue', 'LightValue')
        return brightness ? String(brightness) : null
      })(),
    },
    { label: t(exifKeys.rows.scaleFactor), value: toReadableValue(getExifValue(exif, 'ScaleFactor35efl')) },
    { label: t(exifKeys.rows.sensor), value: toReadableValue(getExifValue(exif, 'SensingMethod')) },
  ].filter((row) => row.value)

  if (captureRows.length > 0) {
    sections.push({ title: t(exifKeys.sections.capture), rows: captureRows as Section['rows'] })
  }

  const metaRows = [
    { label: t(exifKeys.rows.author), value: toReadableValue(getExifValue(exif, 'Artist')) },
    { label: t(exifKeys.rows.copyright), value: toReadableValue(getExifValue(exif, 'Copyright')) },
    { label: t(exifKeys.rows.software), value: toReadableValue(getExifValue(exif, 'Software')) },
    {
      label: t(exifKeys.rows.rating),
      value: (() => {
        const rating = getExifValue<number>(exif, 'Rating')
        return rating && rating > 0 ? `${'★'.repeat(rating)}` : null
      })(),
    },
    { label: t(exifKeys.rows.colorSpace), value: toReadableValue(getExifValue(exif, 'ColorSpace')) },
    { label: t(exifKeys.rows.timezone), value: getExifValue<string>(exif, 'zone', 'tz') },
    { label: t(exifKeys.rows.timezoneSource), value: toReadableValue(getExifValue(exif, 'tzSource')) },
    {
      label: t(exifKeys.rows.timeOffset),
      value: toReadableValue(getExifValue(exif, 'OffsetTime', 'OffsetTimeOriginal')),
    },
  ].filter((row) => row.value)

  if (metaRows.length > 0) {
    sections.push({ title: t(exifKeys.sections.metadata), rows: metaRows as Section['rows'] })
  }

  const gps = convertGPSToDecimal(exif, t)
  const locationRows = [
    { label: t(exifKeys.rows.latitude), value: gps?.latitude ?? null },
    { label: t(exifKeys.rows.longitude), value: gps?.longitude ?? null },
    { label: t(exifKeys.rows.altitude), value: gps?.altitude ?? null },
  ].filter((row) => row.value)

  if (locationRows.length > 0) {
    sections.push({ title: t(exifKeys.sections.location), rows: locationRows as Section['rows'] })
  }

  const fujiRecipe = getExifValue<Record<string, unknown>>(exif, 'FujiRecipe')
  if (fujiRecipe) {
    const recipeRows = Object.entries(fujiRecipe)
      .map(([key, value]) => ({
        label: key
          .replaceAll(/([A-Z])/g, ' $1')
          .replace(/^./, (char) => char.toUpperCase())
          .trim(),
        value: toReadableValue(value),
      }))
      .filter((row) => row.value)

    if (recipeRows.length > 0) {
      sections.push({ title: t(exifKeys.sections.fuji), rows: recipeRows as Section['rows'] })
    }
  }

  return sections
}

export const PhotoExifDetailsModal: ModalComponent<PhotoExifDetailsModalProps> = ({ manifest }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language ?? i18n.resolvedLanguage ?? 'en'
  const sections = buildSections(manifest, t, locale)
  const hasExif = manifest.exif !== null

  return (
    <div className="flex max-h-[80vh] w-full flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{manifest.title || manifest.id}</DialogTitle>
        <DialogDescription>
          <p className="text-text-tertiary text-xs">{t(exifKeys.headerFile, { value: manifest.s3Key })}</p>
        </DialogDescription>
      </DialogHeader>

      <LinearDivider />

      <div className="relative flex-1 pr-1 -mx-6 -mb-6">
        {hasExif ? (
          <ScrollArea rootClassName="h-[60vh]" viewportClassName="px-6 pb-6">
            <div className="space-y-6">
              {sections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-text-secondary text-sm font-semibold">{section.title}</h3>
                  <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.label}`}>
                        <dt className="text-text-tertiary text-[11px] uppercase tracking-wider">{row.label}</dt>
                        <dd className="text-text mt-0.5 font-medium">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="border-fill-tertiary/50 bg-background/70 rounded-xl border px-4 py-8 text-center text-sm text-text-tertiary">
            {t(exifKeys.empty)}
          </div>
        )}
      </div>
    </div>
  )
}

PhotoExifDetailsModal.contentClassName = clsxm('w-[min(640px,95vw)] p-6')
