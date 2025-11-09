import { clsxm } from '@afilmory/utils'
import { AnimatePresence, m } from 'motion/react'
import type { FC, ReactNode } from 'react'
import { createContext, use, useState } from 'react'

type CollapsibleContextValue = {
  isOpen: boolean
  toggle: () => void
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

const useCollapsibleContext = () => {
  const context = use(CollapsibleContext)
  if (!context) {
    throw new Error('Collapsible components must be used within Collapsible')
  }
  return context
}

type CollapsibleProps = {
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export const Collapsible: FC<CollapsibleProps> = ({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const toggle = () => {
    const newValue = !isOpen
    if (!isControlled) {
      setUncontrolledOpen(newValue)
    }
    onOpenChange?.(newValue)
  }

  return (
    <CollapsibleContext value={{ isOpen, toggle }}>
      <div className={clsxm('overflow-hidden', className)}>{children}</div>
    </CollapsibleContext>
  )
}

type CollapsibleTriggerProps = {
  children: ReactNode
  className?: string
  asChild?: boolean
}

export const CollapsibleTrigger: FC<CollapsibleTriggerProps> = ({ children, className }) => {
  const { toggle } = useCollapsibleContext()

  return (
    <button
      type="button"
      onClick={toggle}
      className={clsxm('flex w-full items-center justify-between text-left transition-colors duration-200', className)}
    >
      {children}
    </button>
  )
}

type CollapsibleContentProps = {
  children: ReactNode
  className?: string
}

export const CollapsibleContent: FC<CollapsibleContentProps> = ({ children, className }) => {
  const { isOpen } = useCollapsibleContext()

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={className}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}

type CollapsibleIconProps = {
  className?: string
}

export const CollapsibleIcon: FC<CollapsibleIconProps> = ({ className }) => {
  const { isOpen } = useCollapsibleContext()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsxm('shrink-0 transition-transform duration-200', isOpen && 'rotate-180', className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
