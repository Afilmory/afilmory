import type { FilmFrame, FrameState } from '@afilmory/photo-canvas'
import { FILM_FRAME } from '@afilmory/photo-canvas'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { FrameBus } from './frame-bus'

const EDGE_PX = 34
const SPROCKET_PITCH_PX = 22
const LABELS_FROM = 0.6

const sprocketRow = {
  backgroundImage: `repeating-linear-gradient(90deg, var(--color-background) 0 11px, transparent 11px ${SPROCKET_PITCH_PX}px)`,
}

const pad = (value: number) => String(value).padStart(2, '0')
const monthOf = (date: Date) => `${date.getFullYear()}.${pad(date.getMonth() + 1)}`
const dayOf = (date: Date) => `${monthOf(date)}.${pad(date.getDate())}`

export const CanvasFilmStrip = ({ bus }: { bus: FrameBus }) => {
  const baseRef = useRef<HTMLDivElement>(null)
  const sprocketsRef = useRef<(HTMLDivElement | null)[]>([])
  const labelsRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(new Map<number, HTMLDivElement>())
  const ranksRef = useRef('')
  const frameRef = useRef<FrameState | null>(null)
  const [frames, setFrames] = useState<FilmFrame[]>([])

  const place = (frame: FrameState) => {
    const base = baseRef.current
    const labels = labelsRef.current
    const film = frame.film
    if (!base || !labels) {
      return
    }
    if (!film || film.frames.length === 0) {
      base.style.opacity = '0'
      labels.style.opacity = '0'
      return
    }
    const top = film.frames[0].rect.y
    base.style.opacity = String(film.progress)
    base.style.transform = `translate3d(0, ${Math.round(top - EDGE_PX)}px, 0)`
    for (const row of sprocketsRef.current) {
      if (row) {
        row.style.backgroundPositionX = `${film.offset % SPROCKET_PITCH_PX}px`
      }
    }
    labels.style.opacity = String(Math.max(0, (film.progress - LABELS_FROM) / (1 - LABELS_FROM)))
    for (const item of film.frames) {
      const element = itemsRef.current.get(item.rank)
      if (element) {
        element.style.transform = `translate3d(${Math.round(item.rect.x)}px, ${Math.round(item.rect.y)}px, 0)`
      }
    }
  }

  useEffect(
    () =>
      bus.subscribe((frame) => {
        frameRef.current = frame
        const next = frame.film?.frames ?? []
        const ranks = next.map(item => item.rank).join(',')
        if (ranks !== ranksRef.current) {
          ranksRef.current = ranks
          setFrames(next)
          return
        }
        place(frame)
      }),
    [bus],
  )

  useLayoutEffect(() => {
    if (frameRef.current) {
      place(frameRef.current)
    }
  }, [frames])

  return (
    <>
      <div
        ref={baseRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 bg-black opacity-0"
        style={{ height: FILM_FRAME.height + EDGE_PX * 2 }}
      >
        {[9, FILM_FRAME.height + EDGE_PX * 2 - 17].map((offset, index) => (
          <div
            key={offset}
            ref={(element) => {
              sprocketsRef.current[index] = element
            }}
            className="absolute inset-x-0 h-2"
            style={{ ...sprocketRow, top: offset }}
          />
        ))}
      </div>
      <div ref={labelsRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 opacity-0">
        {frames.map((item, index) => {
          const date = new Date(item.dateTaken)
          const month = monthOf(date)
          const showMonth = item.rank === 0 || (index > 0 && monthOf(new Date(frames[index - 1].dateTaken)) !== month)
          return (
            <div
              key={item.rank}
              ref={(element) => {
                if (element) {
                  itemsRef.current.set(item.rank, element)
                }
                else {
                  itemsRef.current.delete(item.rank)
                }
              }}
              className="absolute top-0 left-0"
              style={{ width: FILM_FRAME.width, height: FILM_FRAME.height }}
            >
              {showMonth && (
                <span
                  className="text-text absolute left-0 text-2xl font-semibold tabular-nums"
                  style={{ bottom: FILM_FRAME.height + EDGE_PX + 16 }}
                >
                  {month}
                </span>
              )}
              <span
                className="text-text-tertiary absolute left-0 font-mono text-[10px] font-semibold tabular-nums"
                style={{ top: -22 }}
              >
                {`▸ ${item.rank + 1}A`}
              </span>
              <span
                className="text-text-tertiary absolute right-0 font-mono text-[10px] font-semibold tabular-nums"
                style={{ bottom: -22 }}
              >
                {dayOf(date)}
              </span>
              {item.camera && (
                <span
                  className="text-text-secondary absolute left-0 text-xs whitespace-nowrap"
                  style={{ top: FILM_FRAME.height + EDGE_PX + 10 }}
                >
                  {item.camera}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
