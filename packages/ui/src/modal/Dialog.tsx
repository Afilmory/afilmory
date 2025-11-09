'use client'

import { clsxm } from '@afilmory/utils'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { HTMLMotionProps, Transition } from 'motion/react'
import { AnimatePresence, m as motion } from 'motion/react'
import * as React from 'react'

type DialogContextType = {
  isOpen: boolean
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined)

function useDialog(): DialogContextType {
  const context = React.use(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within a Dialog')
  }
  return context
}

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>

function Dialog({ children, ...props }: DialogProps) {
  const [isOpen, setIsOpen] = React.useState(props?.open ?? props?.defaultOpen ?? false)

  React.useEffect(() => {
    if (props?.open !== undefined) setIsOpen(props.open)
  }, [props?.open])

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open)
      props.onOpenChange?.(open)
    },
    [props],
  )

  return (
    <DialogContext value={React.useMemo(() => ({ isOpen }), [isOpen])}>
      <DialogPrimitive.Root data-slot="dialog" {...props} onOpenChange={handleOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </DialogContext>
  )
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

type DialogPortalProps = React.ComponentProps<typeof DialogPrimitive.Portal>

function DialogPortal(props: DialogPortalProps) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>

function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} className={clsxm('contents', props.className)} />
}

type DialogOverlayProps = React.ComponentProps<typeof DialogPrimitive.Overlay>

function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={clsxm(
        'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

type FlipDirection = 'top' | 'bottom' | 'left' | 'right'

export type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    from?: FlipDirection
    transition?: Transition
  }

const contentTransition: Transition = {
  type: 'spring',
  stiffness: 150,
  damping: 25,
}
function DialogContent({
  className,
  children,
  from = 'top',
  transition = contentTransition,
  ...props
}: DialogContentProps) {
  const { isOpen } = useDialog()

  const initialRotation = from === 'top' || from === 'left' ? '20deg' : '-20deg'
  const isVertical = from === 'top' || from === 'bottom'
  const rotateAxis = isVertical ? 'rotateX' : 'rotateY'

  return (
    <AnimatePresence>
      {isOpen && (
        <DialogPortal forceMount data-slot="dialog-portal">
          <DialogOverlay asChild forceMount>
            <motion.div
              key="dialog-overlay"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            />
          </DialogOverlay>
          <DialogPrimitive.Content asChild forceMount {...props}>
            <motion.div
              key="dialog-content"
              data-slot="dialog-content"
              initial={{
                opacity: 0,
                filter: 'blur(4px)',
                transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
              }}
              animate={{
                opacity: 1,
                filter: 'blur(0px)',
                transform: `perspective(500px) ${rotateAxis}(0deg) scale(1)`,
              }}
              exit={{
                opacity: 0,
                filter: 'blur(4px)',
                transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
              }}
              transition={transition}
              className={clsxm(
                'fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background px-3 pt-4 pb-3 rounded-lg',
                className,
              )}
              {...props}
            >
              {children}
              <DialogPrimitive.Close className="focus:bg-fill data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-3 right-2 flex size-6 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none">
                <i className="i-mingcute-close-line h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPortal>
      )}
    </AnimatePresence>
  )
}

type DialogHeaderProps = React.ComponentProps<'div'>

function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <div
      data-slot="dialog-header"
      className={clsxm('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  )
}

type DialogFooterProps = React.ComponentProps<'div'>

function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={clsxm('flex flex-col-reverse sm:flex-row sm:justify-end gap-2', className)}
      {...props}
    />
  )
}

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={clsxm('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

type DialogDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={clsxm('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  type DialogCloseProps,
  DialogContent,
  type DialogContextType,
  DialogDescription,
  type DialogDescriptionProps,
  DialogFooter,
  type DialogFooterProps,
  DialogHeader,
  type DialogHeaderProps,
  DialogOverlay,
  type DialogOverlayProps,
  DialogPortal,
  type DialogPortalProps,
  type DialogProps,
  DialogTitle,
  type DialogTitleProps,
  DialogTrigger,
  type DialogTriggerProps,
}
