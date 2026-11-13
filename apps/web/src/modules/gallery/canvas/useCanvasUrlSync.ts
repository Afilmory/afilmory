import { useAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'

import { canvasArrangeAtom } from './atoms'
import { parseCanvasUrl, writeCanvasUrl } from './url-state'

export const useCanvasUrlSync = () => {
  const [settings, setSettings] = useAtom(gallerySettingAtom)
  const [arrange, setArrange] = useAtom(canvasArrangeAtom)
  const [searchParams, setSearchParams] = useSearchParams()
  const skipNextWriteRef = useRef(false)
  const search = searchParams.toString()
  const isCanvas = settings.viewMode === 'canvas'

  useEffect(() => {
    const fromUrl = parseCanvasUrl(new URLSearchParams(search))
    const urlIsCanvas = fromUrl.view === 'canvas'
    if (urlIsCanvas !== isCanvas) {
      skipNextWriteRef.current = true
      setSettings(prev => ({
        ...prev,
        viewMode: urlIsCanvas ? 'canvas' : prev.viewMode === 'canvas' ? 'masonry' : prev.viewMode,
      }))
    }
    if (urlIsCanvas && fromUrl.arrange !== arrange) {
      skipNextWriteRef.current = true
      setArrange(fromUrl.arrange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to URL changes only; state changes are written by the effect below
  }, [search])

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false
      return
    }
    setSearchParams(
      (current) => {
        const next = writeCanvasUrl(current, { view: isCanvas ? 'canvas' : null, arrange })
        return next.toString() === current.toString() ? current : next
      },
      { replace: true },
    )
  }, [isCanvas, arrange, setSearchParams])
}
