import { clsxm } from '@afilmory/utils'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as React from 'react'

const DropdownMenu: typeof DropdownMenuPrimitive.Root = (props) => {
  return <DropdownMenuPrimitive.Root {...props} />
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = ({
  ref,
  className,
  inset,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger> | null>
}) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={clsxm(
      'cursor-menu focus:bg-theme-selection-active focus:text-theme-selection-foreground data-[state=open]:bg-theme-selection-active data-[state=open]:text-theme-selection-foreground flex select-none items-center rounded-[5px] px-2.5 py-1.5 outline-none',
      inset && 'pl-8',
      'center gap-2',
      className,
      props.disabled && 'cursor-not-allowed opacity-30',
    )}
    {...props}
  >
    {children}
    <i className="i-mingcute-right-line -mr-1 ml-auto size-3.5" />
  </DropdownMenuPrimitive.SubTrigger>
)
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuContent = ({
  ref,
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Content> | null>
}) => {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={clsxm(
          'backdrop-blur-2xl text-text z-60 min-w-32 overflow-hidden rounded-xl p-1 relative border border-accent/20',
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
    </DropdownMenuPrimitive.Portal>
  )
}
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = ({
  ref,
  className,
  inset,
  icon,
  active,
  highlightColor: _highlightColor = 'accent',
  shortcut: _shortcut,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  icon?: React.ReactNode | ((props?: { isActive?: boolean }) => React.ReactNode)
  active?: boolean
  highlightColor?: 'accent' | 'gray'
  shortcut?: string
} & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Item> | null>
}) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={clsxm(
      'cursor-menu relative flex select-none items-center rounded-lg px-2.5 py-1 outline-none data-disabled:pointer-events-none data-disabled:opacity-50',
      'focus-within:outline-transparent text-sm my-0.5 transition-all duration-200',
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
  >
    {!!icon && (
      <span className="mr-1.5 inline-flex size-4 items-center justify-center">
        {typeof icon === 'function' ? icon({ isActive: active }) : icon}
      </span>
    )}
    {props.children}

    {/* Justify Fill */}
    {!!icon && <span className="ml-1.5 size-4" />}
  </DropdownMenuPrimitive.Item>
)
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = ({
  ref,
  className,
  children,
  checked,
  icon,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
  icon?: React.ReactNode
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem> | null>
}) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={clsxm(
      'cursor-menu relative flex select-none items-center rounded-lg py-1.5 pl-2 pr-2 text-sm outline-none transition-all duration-200',
      'data-disabled:pointer-events-none data-disabled:opacity-50',
      'data-highlighted:text-accent',
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
    {!!icon && <span className="mr-1.5 inline-flex size-4 items-center justify-center">{icon}</span>}
    {children}
    <span className="ml-auto flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator className="ml-1 flex items-center justify-center">
        <i className="i-mingcute-check-line size-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
  </DropdownMenuPrimitive.CheckboxItem>
)
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
} & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Label> | null>
}) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={clsxm('text-text px-2 py-1 text-sm font-semibold', inset && 'pl-8', className)}
    {...props}
  />
)
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Separator> | null>
}) => (
  <DropdownMenuPrimitive.Separator
    className="mx-2 my-1 h-px px-2"
    style={{
      background:
        'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent)',
    }}
    ref={ref}
    {...props}
  />
)
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
