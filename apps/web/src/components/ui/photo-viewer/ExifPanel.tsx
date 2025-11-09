import './PhotoViewer.css'

import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
import { MotionButtonBase, ScrollArea } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { isNil } from 'es-toolkit/compat'
import { useAtomValue } from 'jotai'
import { m } from 'motion/react'
import type { FC } from 'react'
import { Fragment, useMemo } from 'react'
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
import { getImageFormat } from '~/lib/image-utils'
import { convertExifGPSToDecimal } from '~/lib/map-utils'

import { formatExifData, Row } from './formatExifData'
import { HistogramChart } from './HistogramChart'
import { MiniMap } from './MiniMap'
import { RawExifViewer } from './RawExifViewer'

export const ExifPanel: FC<{
  currentPhoto: PhotoManifestItem
  exifData: PickedExif | null

  onClose?: () => void
  visible?: boolean
}> = ({ currentPhoto, exifData, onClose, visible = true }) => {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const formattedExifData = formatExifData(exifData)
  const isExiftoolLoaded = useAtomValue(isExiftoolLoadedAtom)

  // Compute decimal GPS coordinates from raw EXIF data
  const gpsData = useMemo(() => convertExifGPSToDecimal(exifData), [exifData])

  const decimalLatitude = gpsData?.latitude || null
  const decimalLongitude = gpsData?.longitude || null

  // 使用通用的图片格式提取函数
  const imageFormat = getImageFormat(currentPhoto.originalUrl || currentPhoto.s3Key || '')
  const megaPixels = (((currentPhoto.height * currentPhoto.width) / 1000000) | 0).toString()

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

      <ScrollArea
        rootClassName="flex-1 min-h-0 overflow-auto lg:overflow-hidden"
        viewportClassName="px-4 pb-4 **:select-text"
      >
        <div className={`space-y-${isMobile ? '3' : '4'}`}>
          {/* 基本信息和标签 - 合并到一个 section */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-white/80">{t('exif.basic.info')}</h4>
            <div className="space-y-1 text-sm">
              <Row label={t('exif.filename')} value={currentPhoto.title} ellipsis={true} />
              <Row label={t('exif.format')} value={imageFormat} />
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
            </div>

            {formattedExifData &&
              (formattedExifData.shutterSpeed ||
                formattedExifData.iso ||
                formattedExifData.aperture ||
                formattedExifData.exposureBias ||
                formattedExifData.focalLength35mm) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.capture.parameters')}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {formattedExifData.focalLength35mm && (
                      <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
                        <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-sm text-white/70" />
                        <span className="text-xs">{formattedExifData.focalLength35mm}mm</span>
                      </div>
                    )}

                    {formattedExifData.aperture && (
                      <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
                        <TablerAperture className="text-sm text-white/70" />
                        <span className="text-xs">{formattedExifData.aperture}</span>
                      </div>
                    )}

                    {formattedExifData.shutterSpeed && (
                      <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
                        <MaterialSymbolsShutterSpeed className="text-sm text-white/70" />
                        <span className="text-xs">{formattedExifData.shutterSpeed}</span>
                      </div>
                    )}

                    {formattedExifData.iso && (
                      <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
                        <CarbonIsoOutline className="text-sm text-white/70" />
                        <span className="text-xs">ISO {formattedExifData.iso}</span>
                      </div>
                    )}

                    {formattedExifData.exposureBias && (
                      <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
                        <MaterialSymbolsExposure className="text-sm text-white/70" />
                        <span className="text-xs">{formattedExifData.exposureBias}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* 标签信息 - 移到基本信息 section 内 */}
            {currentPhoto.tags && currentPhoto.tags.length > 0 && (
              <div className="mt-3 mb-3">
                <h4 className="mb-2 text-sm font-medium text-white/80">{t('exif.tags')}</h4>
                <div className="-ml-1 flex flex-wrap gap-1.5">
                  {currentPhoto.tags.map((tag) => (
                    <MotionButtonBase
                      type="button"
                      onClick={() => {
                        window.open(`/?tags=${tag}`, '_blank', 'noopener,noreferrer')
                      }}
                      key={tag}
                      className="glassmorphic-btn border-accent/20 bg-accent/10 inline-flex cursor-pointer items-center rounded-full border px-2 py-1 text-xs text-white/90 backdrop-blur-sm"
                    >
                      {tag}
                    </MotionButtonBase>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 影调分析和直方图 */}
          {currentPhoto.toneAnalysis && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/80">{t('exif.tone.analysis.title')}</h4>
              <div>
                {/* 影调信息 */}
                <Row
                  label={t('exif.tone.type')}
                  value={(() => {
                    const toneTypeMap = {
                      'low-key': t('exif.tone.low-key'),
                      'high-key': t('exif.tone.high-key'),
                      normal: t('exif.tone.normal'),
                      'high-contrast': t('exif.tone.high-contrast'),
                    }
                    return toneTypeMap[currentPhoto.toneAnalysis!.toneType] || currentPhoto.toneAnalysis!.toneType
                  })()}
                />
                <div className="mt-1 mb-3 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
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

                {/* 直方图 */}
                <div className="mb-3">
                  <div className="mb-2 text-xs font-medium text-white/70">{t('exif.histogram')}</div>
                  <HistogramChart thumbnailUrl={currentPhoto.thumbnailUrl} />
                </div>
              </div>
            </div>
          )}

          {formattedExifData && (
            <Fragment>
              {(formattedExifData.camera || formattedExifData.lens) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.device.info')}</h4>
                  <div className="space-y-1 text-sm">
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
                  </div>
                </div>
              )}

              {/* 新增：拍摄模式信息 */}
              {(formattedExifData.exposureMode ||
                formattedExifData.exposureProgram ||
                formattedExifData.meteringMode ||
                formattedExifData.whiteBalance ||
                formattedExifData.lightSource ||
                formattedExifData.flash) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.capture.mode')}</h4>
                  <div className="space-y-1 text-sm">
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
                    {/* {!isNil(formattedExifData.whiteBalanceFineTune) && (
                      <Row
                        label={t('exif.white.balance.fine.tune')}
                        value={formattedExifData.whiteBalanceFineTune}
                      />
                    )} */}

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
                  </div>
                </div>
              )}

              {formattedExifData.fujiRecipe && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.fuji.film.simulation')}</h4>
                  <div className="space-y-1 text-sm">
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
                    {(!isNil(formattedExifData.fujiRecipe.GrainEffectRoughness) ||
                      !isNil(formattedExifData.fujiRecipe.GrainEffectSize)) && (
                      <>
                        {formattedExifData.fujiRecipe.GrainEffectRoughness && (
                          <Row
                            label={t('exif.grain.effect.intensity')}
                            value={formattedExifData.fujiRecipe.GrainEffectRoughness}
                          />
                        )}
                        {!isNil(formattedExifData.fujiRecipe.GrainEffectSize) && (
                          <Row
                            label={t('exif.grain.effect.size')}
                            value={formattedExifData.fujiRecipe.GrainEffectSize}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {formattedExifData.gps && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.gps.location.info')}</h4>
                  <div className="space-y-1 text-sm">
                    <Row label={t('exif.gps.latitude')} value={formattedExifData.gps.latitude} />
                    <Row label={t('exif.gps.longitude')} value={formattedExifData.gps.longitude} />
                    {formattedExifData.gps.altitude && (
                      <Row label={t('exif.gps.altitude')} value={`${formattedExifData.gps.altitude}m`} />
                    )}

                    {/* Maplibre MiniMap */}
                    {decimalLatitude !== null && decimalLongitude !== null && (
                      <div className="mt-3">
                        <MiniMap latitude={decimalLatitude} longitude={decimalLongitude} photoId={currentPhoto.id} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 新增：技术参数 */}
              {(formattedExifData.brightnessValue ||
                formattedExifData.shutterSpeedValue ||
                formattedExifData.apertureValue ||
                formattedExifData.sensingMethod ||
                formattedExifData.focalPlaneXResolution ||
                formattedExifData.focalPlaneYResolution) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">{t('exif.technical.parameters')}</h4>
                  <div className="space-y-1 text-sm">
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
                  </div>
                </div>
              )}
            </Fragment>
          )}
        </div>
      </ScrollArea>
    </m.div>
  )
}
