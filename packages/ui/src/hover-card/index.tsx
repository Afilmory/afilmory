import { clsxm, Spring } from '@afilmory/utils'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { m } from 'motion/react'
import * as React from 'react'

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = ({
  ref,
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> & {
  ref?: React.RefObject<React.ElementRef<typeof HoverCardPrimitive.Content> | null>
}) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={clsxm(
        'z-50 w-64 rounded-2xl p-4 outline-none backdrop-blur-2xl relative overflow-hidden',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      asChild
      {...props}
    >
      <m.div
        className="border-accent/20 border"
        style={{
          backgroundImage:
            'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
          boxShadow:
            '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
        initial={{ opacity: 0, scale: 0.95, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 4 }}
        transition={Spring.presets.smooth}
      >
        {/* Inner glow layer */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              'linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))',
          }}
        />

        {/* Content */}
        <div className="relative">{props.children}</div>
      </m.div>
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
)
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardContent, HoverCardTrigger }
