import type * as DialogPrimitive from '@radix-ui/react-dialog'
import type { HTMLMotionProps } from 'motion/react'
import type { FC } from 'react'

export type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & HTMLMotionProps<'div'>

export type ModalComponentProps = {
  modalId: string
  dismiss: () => void
}

export type ModalComponent<P = unknown> = FC<ModalComponentProps & P> & {
  contentProps?: Partial<DialogContentProps>
  contentClassName?: string
}

export type ModalContentConfig = Partial<DialogContentProps>

export type ModalItem = {
  id: string
  component: ModalComponent<any>
  props?: unknown
  modalContent?: ModalContentConfig
}
