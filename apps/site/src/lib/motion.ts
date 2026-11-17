import { useEffect } from 'react'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function progressOf(el: HTMLElement, viewport: number) {
  const range = Number(el.dataset.scrollRange)
  if (range) {
    return clamp01(window.scrollY / range)
  }
  const rect = el.getBoundingClientRect()
  const start = Number(el.dataset.scrollStart ?? 1)
  const end = Number(el.dataset.scrollEnd ?? 0.25)
  return clamp01((viewport * start - rect.top) / (viewport * (start - end)))
}

export function useLandingMotion() {
  useEffect(() => {
    const root = document.documentElement
    if (root.dataset.motion !== 'on') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLElement).dataset.inview = ''
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    const revealed = document.querySelectorAll<HTMLElement>('[data-reveal]')
    revealed.forEach(el => observer.observe(el))

    const scrubbed = [...document.querySelectorAll<HTMLElement>('[data-scroll]')]
    let frame = 0
    const update = () => {
      frame = 0
      const viewport = window.innerHeight
      for (const el of scrubbed) {
        el.style.setProperty('--p', progressOf(el, viewport).toFixed(4))
      }
      root.style.setProperty('--nav-p', clamp01(window.scrollY / 120).toFixed(3))
    }
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])
}

export function trackPointer(event: React.PointerEvent<HTMLElement>) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  el.style.setProperty('--my', `${event.clientY - rect.top}px`)
}
