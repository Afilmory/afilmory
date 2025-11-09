import { clsxm as cn } from '@afilmory/utils'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as React from 'react'

import { RootPortal } from '../portal'

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = ({
  ref,

  className,
  children,
  error,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  error?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Trigger> | null>
}) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'border-fill-tertiary bg-background flex w-full items-center justify-between rounded border whitespace-nowrap',
      'text-text px-3 py-2 text-sm',
      'focus:ring-accent/40 focus:ring-2 focus:outline-none',
      'transition-all duration-200',
      'disabled:cursor-not-allowed disabled:opacity-60',
      '[&>span]:line-clamp-1',
      error && 'border-red/60 focus:ring-red/30',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <i className="i-mingcute-down-line -mr-1 ml-2 size-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
)
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.ScrollUpButton> | null>
}) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('cursor-menu flex items-center justify-center py-1', className)}
    {...props}
  >
    <i className="i-mingcute-up-line size-3.5" />
  </SelectPrimitive.ScrollUpButton>
)
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.ScrollDownButton> | null>
}) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('cursor-menu flex items-center justify-center py-1', className)}
    {...props}
  >
    <i className="i-mingcute-down-line size-3.5" />
  </SelectPrimitive.ScrollDownButton>
)
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = ({
  ref,
  className,
  children,
  position = 'item-aligned',
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Content> | null>
}) => (
  <RootPortal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'bg-material-medium backdrop-blur-background text-text z-[60] max-h-96 min-w-32 overflow-hidden rounded border p-1',
        'shadow-context-menu',
        'motion-scale-in-75 motion-duration-150 text-body lg:animate-none',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-0',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </RootPortal>
)
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Label> | null>
}) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('text-text px-2 py-1.5 font-semibold', inset && 'pl-8', className)}
    {...props}
  />
)
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = ({
  ref,
  className,
  children,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Item> | null>
}) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'cursor-menu data-[highlighted]:text-accent-foreground relative flex items-center rounded px-2.5 py-1 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      'data-[highlighted]:bg-accent/20 focus-within:outline-transparent',
      'h-[28px] w-full',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <i className="i-mgc-check-filled size-3" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
)
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Separator> | null>
}) => <SelectPrimitive.Separator className="bg-border mx-2 my-1 h-px w-full" ref={ref} {...props} />
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
