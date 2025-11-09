import { clsxm } from '@afilmory/utils'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import * as React from 'react'

const ContextMenu = ContextMenuPrimitive.Root
const ContextMenuTrigger = ContextMenuPrimitive.Trigger
const ContextMenuGroup = ContextMenuPrimitive.Group
const ContextMenuSub = ContextMenuPrimitive.Sub
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup
const RootPortal = ContextMenuPrimitive.Portal

const ContextMenuSubTrigger = ({
  ref,
  className,
  inset,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.SubTrigger> | null>
}) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={clsxm(
      'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex select-none items-center rounded-[5px] px-2.5 py-1.5 outline-none',
      inset && 'pl-8',
      'flex items-center justify-center gap-2',
      className,
      props.disabled && 'cursor-not-allowed opacity-30',
    )}
    {...props}
  >
    {children}
    <i className="i-mingcute-right-line -mr-1 ml-auto size-3.5" />
  </ContextMenuPrimitive.SubTrigger>
)
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName

const ContextMenuSubContent = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.SubContent> | null>
}) => (
  <RootPortal>
    <ContextMenuPrimitive.SubContent
      ref={ref}
      className={clsxm(
        'backdrop-blur-2xl text-text text-body',
        'min-w-32 overflow-hidden',
        'rounded-xl p-1 relative border border-accent/20',
        'z-10061',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
        boxShadow:
          '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
      {...props}
    />
  </RootPortal>
)
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName

const ContextMenuContent = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Content> | null>
}) => (
  <RootPortal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={clsxm(
        'backdrop-blur-2xl text-text z-10060 min-w-32 overflow-hidden rounded-xl p-1 relative border border-accent/20',
        'motion-scale-in-75 motion-duration-150 text-body lg:animate-none',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
        boxShadow:
          '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
      {...props}
    />
  </RootPortal>
)
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

const ContextMenuItem = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Item> | null>
}) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={clsxm(
      'cursor-menu text-sm relative flex select-none items-center rounded-lg px-2.5 py-1 outline-none data-disabled:pointer-events-none data-disabled:opacity-50',
      'focus-within:outline-transparent transition-all duration-200',
      'data-highlighted:text-accent',
      'h-[28px]',
      inset && 'pl-8',
      className,
    )}
    style={{
      // @ts-ignore - CSS variable for data-highlighted state
      '--highlight-bg':
        'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
    }}
    {...props}
  />
)
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

const ContextMenuCheckboxItem = ({
  ref,
  className,
  children,
  checked,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem> | null>
}) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={clsxm(
      'cursor-checkbox text-sm relative flex select-none items-center rounded-lg px-8 py-1.5 outline-none data-disabled:pointer-events-none data-disabled:opacity-50',
      'focus-within:outline-transparent transition-all duration-200',
      'data-highlighted:text-accent',
      'h-[28px]',
      className,
    )}
    checked={checked}
    style={{
      // @ts-ignore - CSS variable for data-highlighted state
      '--highlight-bg':
        'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 8%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
    }}
    {...props}
  >
    <span className="absolute left-2 flex items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator asChild>
        <i className="i-mgc-check-filled size-3" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
)
ContextMenuCheckboxItem.displayName = ContextMenuPrimitive.CheckboxItem.displayName

const ContextMenuLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Label> | null>
}) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={clsxm('text-text px-2 py-1.5 font-semibold', inset && 'pl-8', className)}
    {...props}
  />
)
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

const ContextMenuSeparator = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator> & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Separator> | null>
}) => (
  <ContextMenuPrimitive.Separator
    className="mx-2 my-1 h-px"
    style={{
      background:
        'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent)',
    }}
    ref={ref}
    {...props}
  />
)
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  RootPortal as ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
