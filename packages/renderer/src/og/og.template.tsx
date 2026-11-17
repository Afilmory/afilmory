/** @jsxImportSource hono/jsx */
/** @jsxRuntime automatic */

export interface PhotoDimensions {
  width: number
  height: number
}

export interface ExifInfo {
  focalLength?: string | null
  aperture?: string | null
  iso?: string | number | null
  shutterSpeed?: string | null
  camera?: string | null
}

export interface OgTemplateProps {
  photoTitle: string
  siteName: string
  tags: string[]
  formattedDate?: string
  exifInfo?: ExifInfo | null
  thumbnailSrc?: string | null
  photoDimensions: PhotoDimensions
  accentColor?: string
}

const CANVAS = { width: 1200, height: 628 }

type LayoutType = 'portrait' | 'square' | 'landscape' | 'wide'

interface LayoutConfig {
  type: LayoutType
  arrangement: 'split' | 'stack' | 'wide'
  padding: number
  gap: number
  photoBox: { maxWidth: number, maxHeight: number }
  infoCompact: boolean
  photoFit: 'cover' | 'contain'
}

interface LayoutPieces {
  gap: number
  photo: any
  info: any
  photoWidth: number
}

export function OgTemplate({
  photoTitle,
  siteName,
  tags,
  formattedDate,
  exifInfo,
  thumbnailSrc,
  photoDimensions,
  accentColor = '#86c9ae',
}: OgTemplateProps) {
  const width = Number.isFinite(photoDimensions.width) && photoDimensions.width > 0 ? photoDimensions.width : 1
  const height = Number.isFinite(photoDimensions.height) && photoDimensions.height > 0 ? photoDimensions.height : 1
  const photoAspect = width / height

  const layout = determineLayout(photoAspect)
  const photoSize = fitWithinBox(photoAspect, layout.photoBox)
  const exifItems = buildExifItems(exifInfo)

  const photo = (
    <PhotoFrame width={photoSize.width} height={photoSize.height} fit={layout.photoFit} src={thumbnailSrc} />
  )

  const info = (
    <InfoPanel
      title={photoTitle || 'Untitled Photo'}
      tags={tags}
      exifItems={exifItems}
      camera={exifInfo?.camera ?? null}
      formattedDate={formattedDate}
      accentColor={accentColor}
      compact={layout.infoCompact}
    />
  )

  const layoutComponent
    = layout.arrangement === 'wide' ? WideLayout : layout.arrangement === 'stack' ? StackLayout : SplitLayout

  return (
    <BaseCanvas padding={layout.padding} siteName={siteName}>
      {layoutComponent({ gap: layout.gap, photo, info, photoWidth: photoSize.width })}
    </BaseCanvas>
  )
}

const ogAspect = CANVAS.width / CANVAS.height

function determineLayout(aspect: number): LayoutConfig {
  let finalAspect = aspect
  if (!Number.isFinite(finalAspect) || finalAspect <= 0) {
    finalAspect = 1
  }

  if (finalAspect < 0.9) {
    const padding = 60
    return {
      type: 'portrait',
      arrangement: 'split',
      padding,
      gap: 44,
      photoBox: {
        maxWidth: CANVAS.width * 0.44,
        maxHeight: CANVAS.height - padding * 2,
      },
      infoCompact: false,
      photoFit: 'cover',
    }
  }

  if (finalAspect <= 1.1) {
    const padding = 60
    return {
      type: 'square',
      arrangement: 'split',
      padding,
      gap: 44,
      photoBox: {
        maxWidth: CANVAS.width * 0.5,
        maxHeight: CANVAS.height - padding * 2,
      },
      infoCompact: false,
      photoFit: 'cover',
    }
  }

  if (finalAspect >= 2.35) {
    const padding = 50
    return {
      type: 'wide',
      arrangement: 'wide',
      padding,
      gap: 28,
      photoBox: {
        maxWidth: CANVAS.width - padding * 2,
        maxHeight: 340,
      },
      infoCompact: true,
      photoFit: 'contain',
    }
  }

  const padding = 54
  const landscapeArrangement = finalAspect / ogAspect <= 0.82 ? 'split' : 'stack'

  return {
    type: 'landscape',
    arrangement: landscapeArrangement,
    padding,
    gap: 26,
    photoBox: {
      maxWidth: CANVAS.width - padding * 2,
      maxHeight: 410,
    },
    infoCompact: false,
    photoFit: 'cover',
  }
}

function fitWithinBox(aspect: number, { maxWidth, maxHeight }: LayoutConfig['photoBox']) {
  let width = maxWidth
  let height = width / aspect
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspect
  }
  return { width, height }
}

function buildExifItems(exifInfo?: ExifInfo | null) {
  const items: Array<{ label: string, text: string }> = []
  if (exifInfo?.aperture) {
    items.push({ label: 'f', text: exifInfo.aperture })
  }
  if (exifInfo?.shutterSpeed) {
    items.push({ label: 's', text: exifInfo.shutterSpeed })
  }
  if (exifInfo?.iso) {
    items.push({ label: 'iso', text: `${exifInfo.iso}` })
  }
  if (exifInfo?.focalLength) {
    items.push({ label: 'mm', text: exifInfo.focalLength })
  }
  return items
}

interface BaseCanvasProps {
  padding: number
  siteName: string
  children: any
}

function BaseCanvas({ padding, siteName, children }: BaseCanvasProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: `${padding}px`,
        position: 'relative',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
        fontFamily: 'Geist, HarmonyOS Sans SC, system-ui, -apple-system, sans-serif',
        display: 'flex',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0.02,
          background: `
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          display: 'flex',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: `32px`,
          right: `32px`,
          fontSize: '20px',
          fontWeight: '500',
          color: 'rgba(255,255,255,0.68)',
          letterSpacing: '0.5px',
          display: 'flex',
        }}
      >
        {siteName}
        {' '}
        · Afilmory
      </div>

      <div
        style={{
          position: 'relative',

          width: '100%',
          height: '100%',
          display: 'flex',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SplitLayout({ gap, photo, info }: LayoutPieces) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: `${gap}px`,
        width: '100%',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', flexShrink: 0 }}>{photo}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          height: '100%',
        }}
      >
        {info}
      </div>
    </div>
  )
}

function StackLayout({ gap, photo, info, photoWidth }: LayoutPieces) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${gap}px`,
        width: '100%',
        height: '100%',
        justifyContent: 'flex-start',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{photo}</div>
      <div
        style={{
          width: '100%',
          maxWidth: `${photoWidth}px`,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        {info}
      </div>
    </div>
  )
}

function WideLayout({ gap, photo, info, photoWidth }: LayoutPieces) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${gap}px`,
        width: '100%',
        height: '100%',
        justifyContent: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{photo}</div>
      <div
        style={{
          width: '100%',
          maxWidth: `${photoWidth}px`,
          margin: '0 auto',
          display: 'flex',
          flexShrink: 0,
        }}
      >
        {info}
      </div>
    </div>
  )
}

interface PhotoFrameProps {
  width: number
  height: number
  fit: 'cover' | 'contain'
  src?: string | null
}

function PhotoFrame({ width, height, fit, src }: PhotoFrameProps) {
  if (!src) {
    return (
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '10px',
          backgroundColor: '#050505',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'rgba(255,255,255,0.35)',
            fontSize: '14px',
            letterSpacing: '0.3px',
          }}
        >
          No Preview
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        backgroundColor: '#050505',
        display: 'flex',
      }}
    >
      <img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)',
          display: 'flex',
        }}
      />
    </div>
  )
}

interface InfoPanelProps {
  title: string
  tags: string[]
  exifItems: Array<{ label: string, text: string }>
  camera: string | null
  formattedDate?: string
  accentColor: string
  compact: boolean
}

function InfoPanel({ title, tags, exifItems, camera, formattedDate, accentColor, compact }: InfoPanelProps) {
  const tagLimit = compact ? 2 : 3
  const fontScale = compact ? 0.8 : 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '12px' : '16px',
        color: '#ffffff',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: `${compact ? 28 : 40}px`,
          fontWeight: 700,
          letterSpacing: '-0.5px',
          lineHeight: 1.25,
        }}
      >
        {title}
      </h1>

      {tags.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {tags.slice(0, tagLimit).map(tag => (
            <div
              key={tag}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: `${13 * fontScale}px`,
                color: 'rgba(255,255,255,0.9)',
                backgroundColor: 'rgba(255,255,255,0.12)',
                padding: `${compact ? 4 : 6}px ${compact ? 12 : 14}px`,
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.15)',
                letterSpacing: '0.2px',
              }}
            >
              #
              {tag}
            </div>
          ))}
        </div>
      )}

      {camera && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'rgba(255,255,255,0.7)',
            fontSize: `${15 * fontScale}px`,
          }}
        >
          <span
            style={{
              fontSize: `${11 * fontScale}px`,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}
          >
            cam
          </span>
          <span>{camera}</span>
        </div>
      )}

      {exifItems.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: `${compact ? 12 : 18}px`,
            color: 'rgba(255,255,255,0.75)',
            fontSize: `${14 * fontScale}px`,
            flexWrap: 'wrap',
          }}
        >
          {exifItems.map(item => (
            <div key={`${item.label}-${item.text}`} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: `${10 * fontScale}px`,
                  color: 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.2px',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}

      {formattedDate && (
        <div
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: `${13 * fontScale}px`,
            marginTop: compact ? '2px' : '6px',
            display: 'flex',
          }}
        >
          {formattedDate}
        </div>
      )}

      <div
        style={{
          width: compact ? '50px' : '80px',
          height: '3px',
          background: accentColor,
          borderRadius: '2px',
        }}
      />
    </div>
  )
}

// ==================== Homepage OG Template ====================

export interface HomepageOgTemplateProps {
  siteName: string
  siteDescription?: string | null
  authorAvatar?: string | null
  accentColor?: string
  stats: {
    totalPhotos: number
    uniqueTags: number
    uniqueCameras: number
    totalSizeGB?: number | null
  }
  featuredPhotos?: Array<{ thumbnailSrc: string | null }> | null
}

export function HomepageOgTemplate({
  siteName,
  siteDescription,
  authorAvatar,
  accentColor = '#86c9ae',
  stats,
  featuredPhotos,
}: HomepageOgTemplateProps) {
  const hasAvatar = !!authorAvatar
  const hasFeaturedPhotos = featuredPhotos && featuredPhotos.length > 0

  return (
    <BaseCanvas padding={0} siteName={siteName}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',

          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        {/* Background photo grid - rendered first so content overlays it */}
        {hasFeaturedPhotos && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              opacity: 0.2,
            }}
          >
            {/* First row */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 0,
                flex: 1,
              }}
            >
              {featuredPhotos.slice(0, 3).map((photo, index) => (
                <div
                  key={index}
                  style={{
                    flex: 1,
                    borderRadius: 0,
                    overflow: 'hidden',
                    backgroundColor: '#050505',
                    position: 'relative',
                    display: 'flex',
                  }}
                >
                  {photo.thumbnailSrc && (
                    <img
                      src={photo.thumbnailSrc}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, transparent 50%)',
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Second row */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 0,
                flex: 1,
              }}
            >
              {featuredPhotos.slice(3, 6).map((photo, index) => (
                <div
                  key={index + 3}
                  style={{
                    flex: 1,
                    borderRadius: 0,
                    overflow: 'hidden',
                    backgroundColor: '#050505',
                    position: 'relative',
                    display: 'flex',
                  }}
                >
                  {photo.thumbnailSrc && (
                    <img
                      src={photo.thumbnailSrc}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, transparent 50%)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dark overlay for text readability */}
        {hasFeaturedPhotos && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)',
            }}
          />
        )}

        {/* Content layer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: hasAvatar ? '48px' : '0',
            width: '100%',
            height: '100%',
            position: 'relative',
            padding: '60px',
          }}
        >
          {hasAvatar && (
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '180px',
                  height: '180px',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                  backgroundColor: '#050505',
                  display: 'flex',
                  position: 'relative',
                }}
              >
                <img
                  src={authorAvatar}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)',
                    display: 'flex',
                  }}
                />
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              flex: 1,
              height: '100%',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '56px',
                  fontWeight: 700,
                  letterSpacing: '-1px',
                  lineHeight: 1.2,
                  color: '#ffffff',
                }}
              >
                {siteName}
              </h1>

              {siteDescription && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '22px',
                    fontWeight: 400,
                    lineHeight: 1.4,
                    color: 'rgba(255,255,255,0.75)',
                    maxWidth: '700px',
                  }}
                >
                  {siteDescription}
                </p>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '32px',
                flexWrap: 'wrap',
                marginTop: '8px',
              }}
            >
              <StatItem icon="📸" label="Photos" value={formatNumber(stats.totalPhotos)} />
              <StatItem icon="🏷️" label="Tags" value={formatNumber(stats.uniqueTags)} />
              <StatItem icon="📷" label="Cameras" value={formatNumber(stats.uniqueCameras)} />
              {stats.totalSizeGB !== null && stats.totalSizeGB !== undefined && (
                <StatItem icon="💾" label="Storage" value={`${stats.totalSizeGB.toFixed(1)} GB`} />
              )}
            </div>

            <div
              style={{
                width: '120px',
                height: '4px',
                background: accentColor,
                borderRadius: '2px',
                marginTop: '12px',
              }}
            />
          </div>
        </div>
      </div>
    </BaseCanvas>
  )
}

interface StatItemProps {
  icon: string
  label: string
  value: string
}

function StatItem({ icon, label, value }: StatItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '14px',
          letterSpacing: '0.3px',
        }}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '-0.5px',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}
