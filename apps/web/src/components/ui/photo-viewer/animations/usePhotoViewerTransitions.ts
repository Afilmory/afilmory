import type { RefObject } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { PhotoManifest } from '~/types/photo'

import type {
  AnimationFrameRect,
  PhotoViewerTransition,
  PhotoViewerTransitionState,
} from './types'
import {
  computeViewerImageFrame,
  escapeAttributeValue,
  getBorderRadius,
} from './utils'

interface UsePhotoViewerTransitionsParams {
  isOpen: boolean
  triggerElement: HTMLElement | null
  currentPhoto: PhotoManifest | undefined
  currentBlobSrc: string | null
  isMobile: boolean
}

interface UsePhotoViewerTransitionsResult {
  containerRef: RefObject<HTMLDivElement | null>
  entryTransition: PhotoViewerTransition | null
  exitTransition: PhotoViewerTransition | null
  isViewerContentVisible: boolean
  isEntryAnimating: boolean
  shouldRenderBackdrop: boolean
  thumbHash: string | null
  shouldRenderThumbhash: boolean
  handleEntryAnimationComplete: () => void
  handleExitAnimationComplete: () => void
}

export const usePhotoViewerTransitions = ({
  isOpen,
  triggerElement,
  currentPhoto,
  currentBlobSrc,
  isMobile,
}: UsePhotoViewerTransitionsParams): UsePhotoViewerTransitionsResult => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cachedTriggerRef = useRef<HTMLElement | null>(triggerElement)
  const wasOpenRef = useRef(isOpen)
  const viewerBoundsRef = useRef<DOMRect | null>(null)
  const hiddenTriggerRef = useRef<HTMLElement | null>(null)
  const hiddenTriggerPrevVisibilityRef = useRef<string | null>(null)
  const viewerImageFrameRef = useRef<AnimationFrameRect | null>(null)

  const [entryTransition, setEntryTransition] =
    useState<PhotoViewerTransition | null>(null)
  const [exitTransition, setExitTransition] =
    useState<PhotoViewerTransition | null>(null)
  const [isViewerContentVisible, setIsViewerContentVisible] = useState(false)

  const restoreTriggerElementVisibility = useCallback(() => {
    const trigger = hiddenTriggerRef.current
    if (trigger) {
      const prevVisibility = hiddenTriggerPrevVisibilityRef.current
      if (prevVisibility != null) {
        trigger.style.visibility = prevVisibility
      } else {
        trigger.style.removeProperty('visibility')
      }
    }
    hiddenTriggerRef.current = null
    hiddenTriggerPrevVisibilityRef.current = null
  }, [])

  const hideTriggerElement = useCallback((element: HTMLElement) => {
    hiddenTriggerRef.current = element
    hiddenTriggerPrevVisibilityRef.current = element.style.visibility || null
    element.style.visibility = 'hidden'
  }, [])

  const resolveTriggerElement = useCallback((): HTMLElement | null => {
    if (!currentPhoto) return null

    if (triggerElement && triggerElement.isConnected) {
      cachedTriggerRef.current = triggerElement
      return triggerElement
    }

    const selector = `[data-photo-id="${escapeAttributeValue(currentPhoto.id)}"]`
    const liveTriggerEl =
      typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLElement>(selector)

    if (liveTriggerEl && liveTriggerEl.isConnected) {
      cachedTriggerRef.current = liveTriggerEl
      return liveTriggerEl
    }

    if (cachedTriggerRef.current && cachedTriggerRef.current.isConnected) {
      return cachedTriggerRef.current
    }

    return null
  }, [currentPhoto, triggerElement])

  useEffect(() => {
    if (triggerElement) {
      cachedTriggerRef.current = triggerElement
    }
  }, [triggerElement])

  useEffect(() => {
    return () => {
      restoreTriggerElementVisibility()
    }
  }, [restoreTriggerElementVisibility])

  useEffect(() => {
    if (!isOpen) {
      setEntryTransition(null)
      setIsViewerContentVisible(false)
      viewerImageFrameRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    resolveTriggerElement()
  }, [isOpen, resolveTriggerElement])

  useLayoutEffect(() => {
    if (!isOpen || !currentPhoto) return
    if (entryTransition || isViewerContentVisible) return

    if (typeof window === 'undefined') {
      setIsViewerContentVisible(true)
      return
    }

    const triggerEl = resolveTriggerElement()

    if (!triggerEl) {
      setIsViewerContentVisible(true)
      return
    }

    const fromRect = triggerEl.getBoundingClientRect()
    const viewportRect =
      viewerBoundsRef.current ??
      containerRef.current?.getBoundingClientRect() ??
      null
    const targetFrame = computeViewerImageFrame(
      currentPhoto,
      viewportRect,
      isMobile,
    )

    if (
      !fromRect.width ||
      !fromRect.height ||
      !targetFrame.width ||
      !targetFrame.height
    ) {
      setIsViewerContentVisible(true)
      return
    }

    const imageSrc =
      currentBlobSrc ||
      currentPhoto.thumbnailUrl ||
      currentPhoto.originalUrl ||
      null

    if (!imageSrc) {
      setIsViewerContentVisible(true)
      return
    }

    hideTriggerElement(triggerEl)

    const triggerBorderRadius = getBorderRadius(
      triggerEl instanceof HTMLImageElement && triggerEl.parentElement
        ? triggerEl.parentElement
        : triggerEl,
    )

    setIsViewerContentVisible(true)
    viewerImageFrameRef.current = {
      left: targetFrame.left,
      top: targetFrame.top,
      width: targetFrame.width,
      height: targetFrame.height,
      borderRadius: targetFrame.borderRadius,
    }

    const frameForAnimation = viewerImageFrameRef.current

    const transitionState: PhotoViewerTransitionState = {
      photoId: currentPhoto.id,
      imageSrc,
      thumbHash: currentPhoto.thumbHash,
      from: {
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        height: fromRect.height,
        borderRadius: triggerBorderRadius,
      },
      to: {
        left: frameForAnimation.left,
        top: frameForAnimation.top,
        width: frameForAnimation.width,
        height: frameForAnimation.height,
        borderRadius: frameForAnimation.borderRadius,
      },
    }

    setEntryTransition({ ...transitionState, variant: 'entry' })
  }, [
    isOpen,
    currentPhoto,
    entryTransition,
    isViewerContentVisible,
    currentBlobSrc,
    isMobile,
    resolveTriggerElement,
    hideTriggerElement,
  ])

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      setExitTransition(null)
      return
    }

    if (!wasOpenRef.current || !currentPhoto) {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      return
    }

    if (typeof window === 'undefined') {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      return
    }

    const triggerEl = resolveTriggerElement()

    if (!triggerEl || !triggerEl.isConnected) {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      setExitTransition(null)
      return
    }

    const targetRect = triggerEl.getBoundingClientRect()
    if (!targetRect.width || !targetRect.height) {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      setExitTransition(null)
      return
    }

    const viewportRect =
      viewerBoundsRef.current ??
      containerRef.current?.getBoundingClientRect() ??
      null
    const computedFrame = computeViewerImageFrame(
      currentPhoto,
      viewportRect,
      isMobile,
    )
    const viewerFrame = viewerImageFrameRef.current ?? {
      left: computedFrame.left,
      top: computedFrame.top,
      width: computedFrame.width,
      height: computedFrame.height,
      borderRadius: computedFrame.borderRadius,
    }

    if (!viewerFrame.width || !viewerFrame.height) {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      setExitTransition(null)
      return
    }

    viewerImageFrameRef.current = viewerFrame

    const borderRadius = getBorderRadius(
      triggerEl instanceof HTMLImageElement && triggerEl.parentElement
        ? triggerEl.parentElement
        : triggerEl,
    )

    const imageSrc =
      currentPhoto.thumbnailUrl ||
      currentBlobSrc ||
      currentPhoto.originalUrl ||
      null

    if (!imageSrc) {
      wasOpenRef.current = false
      restoreTriggerElementVisibility()
      setExitTransition(null)
      return
    }

    restoreTriggerElementVisibility()
    hideTriggerElement(triggerEl)

    const transitionState: PhotoViewerTransitionState = {
      photoId: currentPhoto.id,
      imageSrc,
      thumbHash: currentPhoto.thumbHash,
      from: {
        left: viewerFrame.left,
        top: viewerFrame.top,
        width: viewerFrame.width,
        height: viewerFrame.height,
        borderRadius: viewerFrame.borderRadius,
      },
      to: {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        borderRadius,
      },
    }

    setExitTransition({ ...transitionState, variant: 'exit' })

    wasOpenRef.current = false
  }, [
    isOpen,
    currentPhoto,
    currentBlobSrc,
    isMobile,
    resolveTriggerElement,
    restoreTriggerElementVisibility,
    hideTriggerElement,
  ])

  useLayoutEffect(() => {
    if (!isOpen) return

    const updateBounds = () => {
      if (containerRef.current) {
        viewerBoundsRef.current = containerRef.current.getBoundingClientRect()
      }
    }

    updateBounds()
    window.addEventListener('resize', updateBounds)

    return () => {
      window.removeEventListener('resize', updateBounds)
    }
  }, [isOpen])

  const handleEntryAnimationComplete = useCallback(() => {
    setIsViewerContentVisible(true)
    setEntryTransition(null)
  }, [])

  const handleExitAnimationComplete = useCallback(() => {
    restoreTriggerElementVisibility()
    setExitTransition(null)
  }, [restoreTriggerElementVisibility])

  const isEntryAnimating = Boolean(entryTransition)
  const shouldRenderBackdrop =
    isOpen || Boolean(exitTransition) || Boolean(entryTransition)

  const thumbHash =
    typeof currentPhoto?.thumbHash === 'string' ? currentPhoto.thumbHash : null
  const shouldRenderThumbhash = shouldRenderBackdrop && Boolean(thumbHash)

  return {
    containerRef,
    entryTransition,
    exitTransition,
    isViewerContentVisible,
    isEntryAnimating,
    shouldRenderBackdrop,
    thumbHash,
    shouldRenderThumbhash,
    handleEntryAnimationComplete,
    handleExitAnimationComplete,
  }
}
