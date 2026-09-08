import '~/modules/viewer/PhotoViewer.css'

import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
import { MotionButtonBase, ScrollArea } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import { isNil } from 'es-toolkit/compat'
import { useAtomValue } from 'jotai'
import { m } from 'motion/react'
import type { FC } from 'react'
import { Fragment, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { isExiftoolLoadedAtom } from '~/atoms/app'
import { useMobile } from '~/hooks/useMobile'
import {
  CarbonIsoOutline,
  MaterialSymbolsExposure,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from '~/icons'
import { convertExifGPSToDecimal } from '~/lib/map-utils'
import { getRenderablePhotoRegions } from '~/modules/viewer/photo-region-bounds'

import { ExifRowGroup, ExifSection } from './ExifSection'
import { formatExifData, Row } from './formatExifData'
import { HistogramChart } from './HistogramChart'
import { MiniMap } from './MiniMap'
import { PhotoRegionsSection } from './PhotoRegionsSection'
import { RawExifViewer } from './RawExifViewer'

const captureChipClassName = 'border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2'

interface ExifPanelBaseProps {
  currentPhoto: PhotoManifestItem
  exifData: PickedExif | null
  activeRegionId?: string | null
  onActiveRegionChange?: (regionId: string | null) => void
}

interface ExifPanelProps extends ExifPanelBaseProps {
  onClose?: () => void
  visible?: boolean
}

export const ExifPanel: FC<ExifPanelProps> = ({
  currentPhoto,
  exifData,
  activeRegionId,
  onActiveRegionChange,
  onClose,
  visible = true,
}) => {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const isExiftoolLoaded = useAtomValue(isExiftoolLoadedAtom)

  return (
    <m.div
      className={`${
        isMobile
          ? 'exif-panel-mobile fixed right-0 bottom-0 left-0 z-10 max-h-[60vh] w-full rounded-t-2xl backdrop-blur-2xl'
          : 'relative w-80 shrink-0 backdrop-blur-2xl'
      } border-accent/20 flex flex-col text-white`}
      initial={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      animate={{
        opacity: visible ? 1 : 0,
        ...(isMobile ? { y: visible ? 0 : 100 } : { x: visible ? 0 : 100 }),
      }}
      exit={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      transition={Spring.presets.smooth}
      style={{
        pointerEvents: visible ? 'auto' : 'none',
        backgroundImage:
          'linear-gradient(to bottom right, rgba(var(--color-materialMedium)), rgba(var(--color-materialThick)), transparent)',
        boxShadow:
          '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Inner glow layer */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))',
        }}
      />
      <div className="relative z-10 mb-4 flex shrink-0 items-center justify-between p-4 pb-0">
        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold`}>{t('exif.header.title')}</h3>
        {!isMobile && isExiftoolLoaded && <RawExifViewer currentPhoto={currentPhoto} />}
        {isMobile && onClose && (
          <button
            type="button"
            className="glassmorphic-btn border-accent/20 flex size-6 items-center justify-center rounded-full border text-white/70 duration-200 hover:text-white"
            onClick={onClose}
          >
            <i className="i-mingcute-close-line text-sm" />
          </button>
        )}
      </div>

      <ExifPanelContent
        currentPhoto={currentPhoto}
        exifData={exifData}
        activeRegionId={activeRegionId}
        onActiveRegionChange={onActiveRegionChange}
      />
    </m.div>
  )
}

interface ExifPanelContentProps extends ExifPanelBaseProps {
  onTagClick?: (tag: string) => void
  rootClassName?: string
  viewportClassName?: string
}

export const ExifPanelContent: FC<ExifPanelContentProps> = ({
  currentPhoto,
  exifData,
  activeRegionId,
  onActiveRegionChange,
  onTagClick,
  rootClassName = 'flex-1 min-h-0 overflow-auto lg:overflow-hidden',
  viewportClassName = 'px-4 pb-4 **:select-text',
}) => {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const formattedExifData = useMemo(() => formatExifData(exifData), [exifData])
  const regions = useMemo(
    () =>
      getRenderablePhotoRegions(
        currentPhoto.regions ?? [],
        currentPhoto.width,
        currentPhoto.height,
        currentPhoto.exif?.Orientation,
        currentPhoto.exif?.RegionInfo,
      ),
    [currentPhoto],
  )
  const gpsData = useMemo(() => convertExifGPSToDecimal(exifData), [exifData])
  const decimalLatitude = gpsData?.latitude ?? null
  const decimalLongitude = gpsData?.longitude ?? null
  const megaPixels = useMemo(() => {
    if (!currentPhoto.height || !currentPhoto.width) {
      return null
    }
    return (((currentPhoto.height * currentPhoto.width) / 1_000_000) | 0).toString()
  }, [currentPhoto.height, currentPhoto.width])

  const handleTagClick = useCallback(
    (tag: string) => {
      if (onTagClick) {
        onTagClick(tag)
        return
      }
      window.open(`/?tags=${tag}`, '_blank', 'noopener,noreferrer')
    },
    [onTagClick],
  )

  return (
    <ScrollArea mask rootClassName={rootClassName} viewportClassName={viewportClassName}>
      <div className={clsxm('flex flex-col', isMobile ? 'gap-3' : 'gap-4')}>
        <ExifSection title={t('exif.basic.info')}>
          <ExifRowGroup>
            <Row label={t('exif.filename')} value={currentPhoto.title} ellipsis={true} />
            <Row label={t('exif.format')} value={currentPhoto.format} />
            <Row label={t('exif.dimensions')} value={`${currentPhoto.width} × ${currentPhoto.height}`} />
            <Row label={t('exif.file.size')} value={`${(currentPhoto.size / 1024 / 1024).toFixed(1)}MB`} />
            {megaPixels && <Row label={t('exif.pixels')} value={`${megaPixels} MP`} />}
            {formattedExifData?.colorSpace && (
              <Row label={t('exif.color.space')} value={formattedExifData.colorSpace} />
            )}
            {formattedExifData?.rating && formattedExifData.rating > 0 ? (
              <Row label={t('exif.rating')} value={'★'.repeat(formattedExifData.rating)} />
            ) : null}
            {formattedExifData?.dateTime && <Row label={t('exif.capture.time')} value={formattedExifData.dateTime} />}
            {formattedExifData?.zone && <Row label={t('exif.time.zone')} value={formattedExifData.zone} />}
            {formattedExifData?.artist && <Row label={t('exif.artist')} value={formattedExifData.artist} />}
            {formattedExifData?.copyright && <Row label={t('exif.copyright')} value={formattedExifData.copyright} />}
            {formattedExifData?.software && <Row label={t('exif.software')} value={formattedExifData.software} />}
          </ExifRowGroup>
        </ExifSection>

        {formattedExifData
          && (formattedExifData.shutterSpeed
            || formattedExifData.iso
            || formattedExifData.aperture
            || formattedExifData.exposureBias
            || formattedExifData.focalLength35mm) && (
          <ExifSection title={t('exif.capture.parameters')}>
            <div className="grid grid-cols-2 gap-2">
              {formattedExifData.focalLength35mm && (
                <div className={captureChipClassName}>
                  <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-sm text-white/70" />
                  <span className="text-xs">
                    {formattedExifData.focalLength35mm}
                    mm
                  </span>
                </div>
              )}

              {formattedExifData.aperture && (
                <div className={captureChipClassName}>
                  <TablerAperture className="text-sm text-white/70" />
                  <span className="text-xs">{formattedExifData.aperture}</span>
                </div>
              )}

              {formattedExifData.shutterSpeed && (
                <div className={captureChipClassName}>
                  <MaterialSymbolsShutterSpeed className="text-sm text-white/70" />
                  <span className="text-xs">{formattedExifData.shutterSpeed}</span>
                </div>
              )}

              {formattedExifData.iso && (
                <div className={captureChipClassName}>
                  <CarbonIsoOutline className="text-sm text-white/70" />
                  <span className="text-xs">
                    ISO
                    {formattedExifData.iso}
                  </span>
                </div>
              )}

              {formattedExifData.exposureBias && (
                <div className={captureChipClassName}>
                  <MaterialSymbolsExposure className="text-sm text-white/70" />
                  <span className="text-xs">{formattedExifData.exposureBias}</span>
                </div>
              )}
            </div>
          </ExifSection>
        )}

        <PhotoRegionsSection
          regions={regions}
          activeRegionId={activeRegionId}
          onActiveRegionChange={onActiveRegionChange}
        />

        {currentPhoto.tags && currentPhoto.tags.length > 0 && (
          <ExifSection title={t('exif.tags')}>
            <div className="flex flex-wrap gap-1.5">
              {currentPhoto.tags.map(tag => (
                <MotionButtonBase
                  type="button"
                  onClick={() => handleTagClick(tag)}
                  key={tag}
                  className="glassmorphic-btn border-accent/20 bg-accent/10 inline-flex cursor-pointer items-center rounded-full border px-2 py-1 text-xs text-white/90 backdrop-blur-sm"
                >
                  {tag}
                </MotionButtonBase>
              ))}
            </div>
          </ExifSection>
        )}

        {currentPhoto.toneAnalysis && (
          <ExifSection title={t('exif.tone.analysis.title')}>
            <ExifRowGroup>
              <Row
                label={t('exif.tone.type')}
                value={(() => {
                  const toneTypeMap = {
                    'low-key': t('exif.tone.low-key'),
                    'high-key': t('exif.tone.high-key'),
                    'normal': t('exif.tone.normal'),
                    'high-contrast': t('exif.tone.high-contrast'),
                  }
                  return toneTypeMap[currentPhoto.toneAnalysis!.toneType] || currentPhoto.toneAnalysis!.toneType
                })()}
              />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Row label={t('exif.brightness.title')} value={`${currentPhoto.toneAnalysis.brightness}%`} />
                <Row label={t('exif.contrast.title')} value={`${currentPhoto.toneAnalysis.contrast}%`} />
                <Row
                  label={t('exif.shadow.ratio')}
                  value={`${Math.round(currentPhoto.toneAnalysis.shadowRatio * 100)}%`}
                />
                <Row
                  label={t('exif.highlight.ratio')}
                  value={`${Math.round(currentPhoto.toneAnalysis.highlightRatio * 100)}%`}
                />
              </div>
            </ExifRowGroup>
          </ExifSection>
        )}

        {currentPhoto.toneAnalysis && (
          <ExifSection title={t('exif.histogram')}>
            <HistogramChart thumbnailUrl={currentPhoto.thumbnailUrl} />
          </ExifSection>
        )}

        {formattedExifData && (
          <Fragment>
            {(formattedExifData.camera || formattedExifData.lens) && (
              <ExifSection title={t('exif.device.info')}>
                <ExifRowGroup>
                  {formattedExifData.camera && <Row label={t('exif.camera')} value={formattedExifData.camera} />}
                  {formattedExifData.lens && <Row label={t('exif.lens')} value={formattedExifData.lens} />}
                  {formattedExifData.lensMake && !formattedExifData.lens?.includes(formattedExifData.lensMake) && (
                    <Row label={t('exif.lensmake')} value={formattedExifData.lensMake} />
                  )}
                  {formattedExifData.focalLength && (
                    <Row label={t('exif.focal.length.actual')} value={`${formattedExifData.focalLength}mm`} />
                  )}
                  {formattedExifData.focalLength35mm && (
                    <Row label={t('exif.focal.length.equivalent')} value={`${formattedExifData.focalLength35mm}mm`} />
                  )}
                  {formattedExifData.maxAperture && (
                    <Row label={t('exif.max.aperture')} value={`f/${formattedExifData.maxAperture}`} />
                  )}
                </ExifRowGroup>
              </ExifSection>
            )}

            {(formattedExifData.exposureMode
              || formattedExifData.exposureProgram
              || formattedExifData.meteringMode
              || formattedExifData.whiteBalance
              || formattedExifData.lightSource
              || formattedExifData.flash) && (
              <ExifSection title={t('exif.capture.mode')}>
                <ExifRowGroup>
                  {!isNil(formattedExifData.exposureProgram) && (
                    <Row label={t('exif.exposureprogram.title')} value={formattedExifData.exposureProgram} />
                  )}
                  {!isNil(formattedExifData.exposureMode) && (
                    <Row label={t('exif.exposure.mode.title')} value={formattedExifData.exposureMode} />
                  )}
                  {!isNil(formattedExifData.meteringMode) && (
                    <Row label={t('exif.metering.mode.type')} value={formattedExifData.meteringMode} />
                  )}
                  {!isNil(formattedExifData.whiteBalance) && (
                    <Row label={t('exif.white.balance.title')} value={formattedExifData.whiteBalance} />
                  )}
                  {!isNil(formattedExifData.whiteBalanceBias) && (
                    <Row label={t('exif.white.balance.bias')} value={`${formattedExifData.whiteBalanceBias} Mired`} />
                  )}
                  {!isNil(formattedExifData.wbShiftAB) && (
                    <Row label={t('exif.white.balance.shift.ab')} value={formattedExifData.wbShiftAB} />
                  )}
                  {!isNil(formattedExifData.wbShiftGM) && (
                    <Row label={t('exif.white.balance.shift.gm')} value={formattedExifData.wbShiftGM} />
                  )}
                  {!isNil(formattedExifData.flash) && (
                    <Row label={t('exif.flash.title')} value={formattedExifData.flash} />
                  )}
                  {!isNil(formattedExifData.lightSource) && (
                    <Row label={t('exif.light.source.type')} value={formattedExifData.lightSource} />
                  )}
                  {!isNil(formattedExifData.sceneCaptureType) && (
                    <Row label={t('exif.scene.capture.type')} value={formattedExifData.sceneCaptureType} />
                  )}
                  {!isNil(formattedExifData.flashMeteringMode) && (
                    <Row label={t('exif.flash.metering.mode')} value={formattedExifData.flashMeteringMode} />
                  )}
                </ExifRowGroup>
              </ExifSection>
            )}

            {formattedExifData.fujiRecipe && (
              <ExifSection title={t('exif.fuji.film.simulation')}>
                <ExifRowGroup>
                  {formattedExifData.fujiRecipe.FilmMode && (
                    <Row label={t('exif.film.mode')} value={formattedExifData.fujiRecipe.FilmMode} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.DynamicRange) && (
                    <Row label={t('exif.dynamic.range')} value={formattedExifData.fujiRecipe.DynamicRange} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.WhiteBalance) && (
                    <Row label={t('exif.white.balance.title')} value={formattedExifData.fujiRecipe.WhiteBalance} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.HighlightTone) && (
                    <Row label={t('exif.highlight.tone')} value={formattedExifData.fujiRecipe.HighlightTone} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.ShadowTone) && (
                    <Row label={t('exif.shadow.tone')} value={formattedExifData.fujiRecipe.ShadowTone} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.Saturation) && (
                    <Row label={t('exif.saturation')} value={formattedExifData.fujiRecipe.Saturation} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.Sharpness) && (
                    <Row label={t('exif.sharpness')} value={formattedExifData.fujiRecipe.Sharpness} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.NoiseReduction) && (
                    <Row label={t('exif.noise.reduction')} value={formattedExifData.fujiRecipe.NoiseReduction} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.Clarity) && (
                    <Row label={t('exif.clarity')} value={formattedExifData.fujiRecipe.Clarity} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.ColorChromeEffect) && (
                    <Row label={t('exif.color.effect')} value={formattedExifData.fujiRecipe.ColorChromeEffect} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.ColorChromeFxBlue) && (
                    <Row label={t('exif.blue.color.effect')} value={formattedExifData.fujiRecipe.ColorChromeFxBlue} />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.WhiteBalanceFineTune) && (
                    <Row
                      label={t('exif.white.balance.fine.tune')}
                      value={formattedExifData.fujiRecipe.WhiteBalanceFineTune}
                    />
                  )}
                  {formattedExifData.fujiRecipe.GrainEffectRoughness && (
                    <Row
                      label={t('exif.grain.effect.intensity')}
                      value={formattedExifData.fujiRecipe.GrainEffectRoughness}
                    />
                  )}
                  {!isNil(formattedExifData.fujiRecipe.GrainEffectSize) && (
                    <Row label={t('exif.grain.effect.size')} value={formattedExifData.fujiRecipe.GrainEffectSize} />
                  )}
                </ExifRowGroup>
              </ExifSection>
            )}

            {formattedExifData.gps && (
              <ExifSection title={t('exif.gps.location.info')} className="gap-3">
                <ExifRowGroup>
                  <Row label={t('exif.gps.latitude')} value={formattedExifData.gps.latitude} />
                  <Row label={t('exif.gps.longitude')} value={formattedExifData.gps.longitude} />
                  {formattedExifData.gps.altitude && (
                    <Row label={t('exif.gps.altitude')} value={`${formattedExifData.gps.altitude}m`} />
                  )}
                </ExifRowGroup>

                {currentPhoto.location && (
                  <ExifRowGroup>
                    {(currentPhoto.location.city || currentPhoto.location.country) && (
                      <Row
                        label={t('exif.gps.city')}
                        value={[currentPhoto.location.city, currentPhoto.location.country].filter(Boolean).join(', ')}
                      />
                    )}
                    {currentPhoto.location.locationName && (
                      <Row label={t('exif.gps.address')} value={currentPhoto.location.locationName} ellipsis={true} />
                    )}
                  </ExifRowGroup>
                )}

                {decimalLatitude !== null && decimalLongitude !== null && (
                  <MiniMap latitude={decimalLatitude} longitude={decimalLongitude} photoId={currentPhoto.id} />
                )}
              </ExifSection>
            )}

            {(formattedExifData.brightnessValue
              || formattedExifData.shutterSpeedValue
              || formattedExifData.apertureValue
              || formattedExifData.sensingMethod
              || formattedExifData.focalPlaneXResolution
              || formattedExifData.focalPlaneYResolution) && (
              <ExifSection title={t('exif.technical.parameters')}>
                <ExifRowGroup>
                  {formattedExifData.brightnessValue && (
                    <Row label={t('exif.brightness.value')} value={formattedExifData.brightnessValue} />
                  )}
                  {formattedExifData.shutterSpeedValue && (
                    <Row label={t('exif.shutter.speed.value')} value={formattedExifData.shutterSpeedValue} />
                  )}
                  {formattedExifData.apertureValue && (
                    <Row label={t('exif.aperture.value')} value={formattedExifData.apertureValue} />
                  )}
                  {formattedExifData.sensingMethod && (
                    <Row label={t('exif.sensing.method.type')} value={formattedExifData.sensingMethod} />
                  )}
                  {(formattedExifData.focalPlaneXResolution || formattedExifData.focalPlaneYResolution) && (
                    <Row
                      label={t('exif.focal.plane.resolution')}
                      value={`${formattedExifData.focalPlaneXResolution || t('exif.not.available')} × ${formattedExifData.focalPlaneYResolution || t('exif.not.available')}`}
                    />
                  )}
                </ExifRowGroup>
              </ExifSection>
            )}
          </Fragment>
        )}
      </div>
    </ScrollArea>
  )
}
