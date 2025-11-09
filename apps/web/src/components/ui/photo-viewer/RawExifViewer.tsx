import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollArea,
} from '@afilmory/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ExifToolManager } from '~/lib/exiftool'
import type { PhotoManifest } from '~/types/photo'

interface RawExifViewerProps {
  currentPhoto: PhotoManifest
}

type ParsedExifData = Record<string, string | number | boolean | null>

const parseRawExifData = (rawData: string): ParsedExifData => {
  const lines = rawData.split('\n').filter((line) => line.trim())
  const data: ParsedExifData = {}

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, Math.max(0, colonIndex)).trim()
    const value = line.slice(Math.max(0, colonIndex + 1)).trim()

    if (key && value) {
      data[key] = value
    }
  }

  return data
}

const ExifDataRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between border-b border-white/15 py-2 last:border-b-0">
    <span className="max-w-[45%] min-w-0 flex-shrink-0 self-start pr-4 text-sm font-medium break-words text-white/70">
      {label}
    </span>
    <span className="max-w-[55%] min-w-0 text-right font-mono text-sm break-words text-white/95">{value}</span>
  </div>
)

// Group data by categories for better organization
const categories = {
  basic: [
    'ExifTool Version Number',
    'File Name',
    'Directory',
    'File Size',
    'File Type',
    'File Type Extension',
    'MIME Type',
    'Major Brand',
    'Minor Version',
    'Compatible Brands',
  ],
  camera: [
    'Make',
    'Camera Model Name',
    'Model',
    'Software',
    'Serial Number',
    'Internal Serial Number',
    'Fuji Model',
    'Camera Elevation Angle',
    'Roll Angle',
  ],
  exposure: [
    'Exposure Time',
    'F Number',
    'ISO',
    'Exposure Program',
    'Exposure Compensation',
    'Exposure Mode',
    'Metering Mode',
    'Shutter Speed Value',
    'Aperture Value',
    'Brightness Value',
    'Max Aperture Value',
    'Exposure Warning',
    'Auto Bracketing',
  ],
  lens: [
    'Lens Info',
    'Lens Make',
    'Lens Model',
    'Lens Serial Number',
    'Focal Length',
    'Focal Length In 35mm Format',
    'Min Focal Length',
    'Max Focal Length',
    'Max Aperture At Min Focal',
    'Max Aperture At Max Focal',
    'Lens Modulation Optimizer',
    'Lens ID',
  ],
  focus: [
    'Focus Mode',
    'AF Mode',
    'Focus Pixel',
    'AF-S Priority',
    'AF-C Priority',
    'Focus Mode 2',
    'Pre AF',
    'AF Area Mode',
    'AF Area Point Size',
    'AF Area Zone Size',
    'AF-C Setting',
    'AF-C Tracking Sensitivity',
    'AF-C Speed Tracking Sensitivity',
    'AF-C Zone Area Switching',
    'Focus Warning',
    'Subject Distance Range',
  ],
  flash: [
    'Flash',
    'Light Source',
    'Fuji Flash Mode',
    'Flash Exposure Comp',
    'Flash Metering Mode',
    'Slow Sync',
    'Flicker Reduction',
  ],
  datetime: [
    'Date/Time Original',
    'Create Date',
    'Modify Date',
    'File Modification Date/Time',
    'File Access Date/Time',
    'File Inode Change Date/Time',
    'Offset Time',
    'Offset Time Original',
    'Offset Time Digitized',
    'GPS Date/Time',
    'GPS Time Stamp',
    'GPS Date Stamp',
  ],
  gps: [
    'GPS Version ID',
    'GPS Latitude',
    'GPS Latitude Ref',
    'GPS Longitude',
    'GPS Longitude Ref',
    'GPS Altitude',
    'GPS Altitude Ref',
    'GPS Position',
    'GPS Speed',
    'GPS Speed Ref',
    'GPS Time Stamp',
    'GPS Date Stamp',
    'GPS Date/Time',
  ],
  imageProperties: [
    'Image Width',
    'Image Height',
    'Image Size',
    'Meta Image Size',
    'Exif Image Width',
    'Exif Image Height',
    'Image Spatial Extent',
    'Orientation',
    'X Resolution',
    'Y Resolution',
    'Resolution Unit',
    'Bits Per Sample',
    'Megapixels',
    'Aspect Ratio',
    'Color Space',
    'Color Profiles',
    'Color Primaries',
    'Matrix Coefficients',
  ],
  whiteBalance: [
    'White Balance',
    'White Balance Fine Tune',
    'White Balance Bias',
    'WB Shift AB',
    'WB Shift GM',
    'Color Temperature',
    'Auto White Balance',
    'Standard White Balance GRB',
  ],
  fuji: [
    'Film Mode',
    'Dynamic Range',
    'Dynamic Range Setting',
    'Auto Dynamic Range',
    'Highlight Tone',
    'Shadow Tone',
    'Saturation',
    'Sharpness',
    'Noise Reduction',
    'Clarity',
    'Grain Effect Roughness',
    'Grain Effect Size',
    'Color Chrome Effect',
    'Color Chrome FX Blue',
    'Picture Mode',
    'Quality',
    'Contrast',
    'Image Generation',
    'Image Count',
    'Exposure Count',
  ],
  technical: [
    'Sensing Method',
    'File Source',
    'Scene Type',
    'Scene Capture Type',
    'Custom Rendered',
    'Focal Plane X Resolution',
    'Focal Plane Y Resolution',
    'Focal Plane Resolution Unit',
    'Image Stabilization',
    'Blur Warning',
    'Shutter Type',
    'Drive Mode',
    'Drive Speed',
    'Sequence Number',
    'Scale Factor To 35 mm Equivalent',
    'Circle Of Confusion',
    'Field Of View',
    'Hyperfocal Distance',
    'Light Value',
  ],
  video: [
    'HEVC Configuration Version',
    'General Profile Space',
    'General Tier Flag',
    'General Profile IDC',
    'Gen Profile Compatibility Flags',
    'Constraint Indicator Flags',
    'General Level IDC',
    'Min Spatial Segmentation IDC',
    'Parallelism Type',
    'Chroma Format',
    'Bit Depth Luma',
    'Bit Depth Chroma',
    'Average Frame Rate',
    'Constant Frame Rate',
    'Num Temporal Layers',
    'Temporal ID Nested',
    'Transfer Characteristics',
    'Video Full Range Flag',
    'Image Pixel Depth',
    'Rotation',
    'Media Data Size',
    'Media Data Offset',
  ],
  faceDetection: ['Faces Detected', 'Num Face Elements', 'Face Detection'],
  other: [
    'File Permissions',
    'Handler Type',
    'Primary Item Reference',
    'Other Image',
    'Preview Image',
    'Thumbnail Image',
    'Exif Byte Order',
    'Y Cb Cr Positioning',
    'Copyright',
    'Components Configuration',
    'Compressed Bits Per Pixel',
    'Version',
    'Flashpix Version',
    'Interoperability Index',
    'Interoperability Version',
    'Composite Image',
    'PrintIM Version',
    'Artist',
    'Rating',
    'User Comment',
  ],
}

export const RawExifViewer: React.FC<RawExifViewerProps> = ({ currentPhoto }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [rawExifData, setRawExifData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setIsOpen(false)
    setRawExifData(null)
    setIsLoading(false)
  }, [currentPhoto.id])

  const handleOpenModal = async () => {
    if (rawExifData) {
      setIsOpen(true)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(currentPhoto.originalUrl)
      const blob = await response.blob()
      const data = await ExifToolManager.parse(blob, currentPhoto.s3Key)

      setRawExifData(data || null)
      setIsOpen(true)
    } catch (error) {
      console.error('Failed to parse EXIF data:', error)
      toast.error(
        t('exif.raw.parse.error', {
          defaultValue: 'Failed to parse EXIF data',
        }),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const parsedData = rawExifData ? parseRawExifData(rawExifData) : {}
  const dataEntries = Object.entries(parsedData)

  const getCategoryData = (categoryKeys: string[]) => {
    return dataEntries.filter(([key]) => categoryKeys.some((catKey) => key.includes(catKey)))
  }

  const getUncategorizedData = () => {
    const allCategoryKeys = Object.values(categories).flat()
    return dataEntries.filter(([key]) => !allCategoryKeys.some((catKey) => key.includes(catKey)))
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={handleOpenModal}
          disabled={isLoading}
          className="cursor-pointer text-white/70 duration-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <i className="i-mingcute-loading-3-line animate-spin" />
          ) : (
            <i className="i-mingcute-braces-line" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-2 text-white">
        <DialogHeader>
          <DialogTitle>{t('exif.raw.title', { defaultValue: 'Raw EXIF Data' })}</DialogTitle>
          <DialogDescription>
            {t('exif.raw.description', {
              defaultValue: 'Complete EXIF metadata extracted from the image file',
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex h-full grow flex-col items-center justify-center gap-4 text-white/70">
            <i className="i-mingcute-loading-3-line animate-spin text-3xl" />
            <span className="text-sm">
              {t('exif.raw.loading', {
                defaultValue: 'Loading EXIF data...',
              })}
            </span>
          </div>
        )}

        <ScrollArea
          rootClassName="h-0 grow flex-1 -mb-6 -mx-6"
          viewportClassName="px-7 pb-6 pt-4 [&_*]:select-text"
          flex
        >
          <div className="min-w-0 space-y-6">
            {/* Basic File Information */}
            {getCategoryData(categories.basic).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.basic', {
                    defaultValue: 'File Information',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.basic).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Camera Information */}
            {getCategoryData(categories.camera).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.camera', {
                    defaultValue: 'Camera Information',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.camera).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Exposure Settings */}
            {getCategoryData(categories.exposure).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.exposure', {
                    defaultValue: 'Exposure Settings',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.exposure).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Lens Information */}
            {getCategoryData(categories.lens).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.lens', {
                    defaultValue: 'Lens Information',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.lens).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Date & Time */}
            {getCategoryData(categories.datetime).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.datetime', {
                    defaultValue: 'Date & Time',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.datetime).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* GPS Information */}
            {getCategoryData(categories.gps).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.gps', {
                    defaultValue: 'GPS Information',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.gps).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Focus System */}
            {getCategoryData(categories.focus).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.focus', {
                    defaultValue: 'Focus System',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.focus).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Flash & Lighting */}
            {getCategoryData(categories.flash).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.flash', {
                    defaultValue: 'Flash & Lighting',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.flash).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Image Properties */}
            {getCategoryData(categories.imageProperties).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.imageProperties', {
                    defaultValue: 'Image Properties',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.imageProperties).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* White Balance */}
            {getCategoryData(categories.whiteBalance).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.whiteBalance', {
                    defaultValue: 'White Balance',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.whiteBalance).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Fuji Recipe */}
            {getCategoryData(categories.fuji).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.fuji', {
                    defaultValue: 'Fuji Film Simulation',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.fuji).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Technical Parameters */}
            {getCategoryData(categories.technical).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.technical', {
                    defaultValue: 'Technical Parameters',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.technical).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Video/HEIF Properties */}
            {getCategoryData(categories.video).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.video', {
                    defaultValue: 'Video/HEIF Properties',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.video).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Face Detection */}
            {getCategoryData(categories.faceDetection).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.faceDetection', {
                    defaultValue: 'Face Detection',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.faceDetection).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Other Data */}
            {getCategoryData(categories.other).length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.other', {
                    defaultValue: 'Other Metadata',
                  })}
                </h4>
                <div className="space-y-2">
                  {getCategoryData(categories.other).map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* Uncategorized Data */}
            {getUncategorizedData().length > 0 && (
              <div>
                <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
                  {t('exif.raw.category.uncategorized', {
                    defaultValue: 'Uncategorized',
                  })}
                </h4>
                <div className="space-y-2">
                  {getUncategorizedData().map(([key, value]) => (
                    <ExifDataRow key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {dataEntries.length === 0 && (
              <div className="py-8 text-center text-white/50">
                {t('exif.raw.no.data', {
                  defaultValue: 'No EXIF data available',
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
