// @see https://github.com/Innei/sprightly/blob/2444dcdb789ca585337a4d241095640a524231db/src/lib/scroller.ts
// Aligned with apps/web/src/lib/scroller.ts

import type { Transition } from 'motion/react'
import { animateValue } from 'motion/react'

const spring: Transition = {
  type: 'spring',
  stiffness: 1000,
  damping: 250,
}

const defaultScrollerElement = typeof window !== 'undefined' ? document.documentElement : undefined
export const springScrollTo = (
  value: number,
  scrollerElement: HTMLElement = defaultScrollerElement!,
  axis: 'x' | 'y' = 'y',
) => {
  const currentValue = axis === 'x' ? scrollerElement?.scrollLeft : scrollerElement?.scrollTop

  let isStop = false
  const stopSpringScrollHandler = () => {
    isStop = true
    animation.stop()
  }

  const el = scrollerElement || window
  const animation = animateValue({
    keyframes: [currentValue + 1, value],
    autoplay: true,
    ...spring,
    onPlay() {
      el.addEventListener('wheel', stopSpringScrollHandler, { capture: true })
      el.addEventListener('touchmove', stopSpringScrollHandler)
    },

    onUpdate(latest) {
      if (latest <= 0) {
        animation.stop()
        return
      }

      if (isStop) {
        return
      }

      requestAnimationFrame(() => {
        if (axis === 'x') {
          el.scrollLeft = latest
        } else {
          el.scrollTop = latest
        }
      })
    },
  })

  animation.then(() => {
    el.removeEventListener('wheel', stopSpringScrollHandler, { capture: true })
    el.removeEventListener('touchmove', stopSpringScrollHandler)
  })

  return animation
}

export const springScrollToElement = (
  element: HTMLElement,
  delta = 40,
  scrollerElement: HTMLElement = defaultScrollerElement!,
) => {
  const y = calculateElementTop(element)

  const to = y + delta

  return springScrollTo(to, scrollerElement)
}

const calculateElementTop = (el: HTMLElement) => {
  let top = 0
  while (el) {
    top += el.offsetTop
    el = el.offsetParent as HTMLElement
  }
  return top
}
