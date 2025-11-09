'use client'

import { useControlledState } from '@afilmory/hooks'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import type { HTMLMotionProps, LegacyAnimationControls, TargetAndTransition, VariantLabels } from 'motion/react'
import { m as motion } from 'motion/react'
import * as React from 'react'

import { SwitchProvider, useSwitch } from './switch.context'

type SwitchProps = Omit<React.ComponentProps<typeof SwitchPrimitives.Root>, 'asChild'> & HTMLMotionProps<'button'>

function Switch(props: SwitchProps) {
  const [isPressed, setIsPressed] = React.useState(false)
  const [isChecked, setIsChecked] = useControlledState({
    value: props.checked,
    defaultValue: props.defaultChecked,
    onChange: props.onCheckedChange,
  })
  const captureBaselineRef = React.useRef<(() => void) | null>(null)

  return (
    <SwitchProvider
      value={{
        isChecked,
        setIsChecked,
        isPressed,
        setIsPressed,
        captureBaselineRef,
      }}
    >
      <SwitchPrimitives.Root {...props} onCheckedChange={setIsChecked} asChild>
        <motion.button
          data-slot="switch"
          whileTap="tap"
          initial={false}
          onPointerDown={(e) => {
            // Capture baseline as early as possible for FLIP
            captureBaselineRef.current?.()
            setIsPressed(true)
            props.onPointerDown?.(e)
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              captureBaselineRef.current?.()
            }
            props.onKeyDown?.(e)
          }}
          onTapCancel={() => setIsPressed(false)}
          onTap={() => setIsPressed(false)}
          {...props}
        />
      </SwitchPrimitives.Root>
    </SwitchProvider>
  )
}

type SwitchThumbProps = Omit<React.ComponentProps<typeof SwitchPrimitives.Thumb>, 'asChild'> &
  HTMLMotionProps<'div'> & {
    pressedAnimation?: TargetAndTransition | VariantLabels | boolean | LegacyAnimationControls
  }

function SwitchThumb({ pressedAnimation, transition, ...props }: SwitchThumbProps) {
  const { isPressed, isChecked, captureBaselineRef } = useSwitch()
  const thumbRef = React.useRef<HTMLDivElement | null>(null)
  const prevRectRef = React.useRef<DOMRect | null>(null)

  const resolvedTransition = React.useMemo(
    () => transition ?? ({ type: 'spring', stiffness: 300, damping: 25 } as const),
    [transition],
  )

  React.useLayoutEffect(() => {
    const el = thumbRef.current
    if (!el) return

    // Ensure baseline is current on mount/update
    if (!prevRectRef.current) {
      prevRectRef.current = el.getBoundingClientRect()
    }

    const newRect = el.getBoundingClientRect()
    const prevRect = prevRectRef.current

    if (prevRect) {
      const deltaX = prevRect.left - newRect.left
      const deltaY = prevRect.top - newRect.top

      if (deltaX !== 0 || deltaY !== 0) {
        const durationMs =
          typeof (resolvedTransition as any)?.duration === 'number' ? (resolvedTransition as any).duration * 1000 : 200
        const easing = (resolvedTransition as any)?.ease || 'cubic-bezier(0.22, 1, 0.36, 1)'

        // Defer to next frame to ensure layout settles in scroll containers
        requestAnimationFrame(() => {
          el.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }], {
            duration: durationMs,
            easing,
          })
        })
      }
    }

    prevRectRef.current = newRect
  }, [isChecked, resolvedTransition])

  // Provide capture function to parent so it can snapshot baseline on pointer/tap start
  React.useLayoutEffect(() => {
    captureBaselineRef.current = () => {
      const el = thumbRef.current
      if (!el) return
      prevRectRef.current = el.getBoundingClientRect()
    }
    return () => {
      if (captureBaselineRef.current) captureBaselineRef.current = null
    }
  }, [captureBaselineRef])

  // No global scroll listeners; baseline is captured on interaction and animation starts next frame

  return (
    <SwitchPrimitives.Thumb asChild>
      <motion.div
        ref={thumbRef}
        data-slot="switch-thumb"
        whileTap="tab"
        transition={resolvedTransition}
        animate={isPressed ? pressedAnimation : undefined}
        {...props}
      />
    </SwitchPrimitives.Thumb>
  )
}

type SwitchIconPosition = 'left' | 'right' | 'thumb'

type SwitchIconProps = HTMLMotionProps<'div'> & {
  position: SwitchIconPosition
}

function SwitchIcon({ position, transition, ...props }: SwitchIconProps) {
  const { isChecked } = useSwitch()

  const resolvedTransition = React.useMemo(() => transition ?? ({ type: 'spring', bounce: 0 } as const), [transition])

  const isAnimated = React.useMemo(() => {
    if (position === 'right') return !isChecked
    if (position === 'left') return isChecked
    if (position === 'thumb') return true
    return false
  }, [position, isChecked])

  return (
    <motion.div
      data-slot={`switch-${position}-icon`}
      animate={isAnimated ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      transition={resolvedTransition}
      {...props}
    />
  )
}

export {
  Switch,
  SwitchIcon,
  type SwitchIconPosition,
  type SwitchIconProps,
  type SwitchProps,
  SwitchThumb,
  type SwitchThumbProps,
}
