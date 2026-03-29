import { RootPortal, RootPortalProvider } from '@afilmory/ui'
import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RemoveScroll } from 'react-remove-scroll'

import { NotFound } from '~/components/common/NotFound'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTitle } from '~/hooks/useTitle'
import { deriveAccentFromSources } from '~/lib/color'
import { PhotoViewer } from '~/modules/viewer'

export const Component = () => {
  const photoViewer = usePhotoViewer()
  const photos = useContextPhotos()

  const [ref, setRef] = useState<HTMLElement | null>(null)
  const rootPortalValue = useMemo(
    () => ({
      to: ref as HTMLElement,
    }),
    [ref],
  )
  useTitle(photos[photoViewer.currentIndex]?.title || 'Not Found')

  const [accentColor, setAccentColor] = useState<string | null>(null)

  // Track closing state to allow exit animation before navigation.
  // isCloseActiveRef is set when a close is requested and cleared when the
  // photo route changes, so a stale animation completion cannot navigate away.
  const [isClosing, setIsClosing] = useState(false)
  const closeViewerRef = useRef(photoViewer.closeViewer)
  closeViewerRef.current = photoViewer.closeViewer
  const isCloseActiveRef = useRef(false)

  // Cancel a pending close when the viewed photo changes (e.g. browser back/forward)
  useEffect(() => {
    if (isClosing) {
      isCloseActiveRef.current = false
      setIsClosing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoViewer.currentIndex])

  const handleClose = useCallback(() => {
    isCloseActiveRef.current = true
    setIsClosing(true)
  }, [])

  const handleExitComplete = useCallback(() => {
    if (isCloseActiveRef.current) {
      isCloseActiveRef.current = false
      // Navigate away — the component unmounts so no need to reset isClosing.
      // Resetting it before navigation would momentarily flip isOpen back to true
      // (the URL still has the photoId), causing the backdrop to flash.
      closeViewerRef.current()
    } else {
      setIsClosing(false)
    }
  }, [])

  useEffect(() => {
    const current = photos[photoViewer.currentIndex]
    if (!current) return

    let isCancelled = false

    ;(async () => {
      try {
        const color = await deriveAccentFromSources({
          thumbHash: current.thumbHash,
          thumbnailUrl: current.thumbnailUrl,
        })
        if (!isCancelled) {
          const $css = document.createElement('style')
          $css.textContent = `
         * {
             transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
            }
          `
          document.head.append($css)

          setTimeout(() => {
            $css.remove()
          }, 100)

          setAccentColor(color ?? null)
        }
      } catch {
        if (!isCancelled) setAccentColor(null)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [photoViewer.currentIndex, photos])

  if (!photos[photoViewer.currentIndex]) {
    return <NotFound />
  }

  const isOpen = photoViewer.isOpen && !isClosing

  return (
    <RootPortal>
      <RootPortalProvider value={rootPortalValue}>
        <RemoveScroll
          style={
            {
              ...(accentColor ? { '--color-accent': accentColor } : {}),
            } as React.CSSProperties
          }
          ref={setRef}
          className={clsx(isOpen ? 'fixed inset-0 z-9999' : 'pointer-events-none fixed inset-0 z-40')}
        >
          <PhotoViewer
            photos={photos}
            currentIndex={photoViewer.currentIndex}
            isOpen={isOpen}
            triggerElement={photoViewer.triggerElement}
            onClose={handleClose}
            onIndexChange={photoViewer.goToIndex}
            onExitComplete={handleExitComplete}
          />
        </RemoveScroll>
      </RootPortalProvider>
    </RootPortal>
  )
}
