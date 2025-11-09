import { clsxm, Spring } from '@afilmory/utils'
import { useAtomValue } from 'jotai'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useEventCallback } from 'usehooks-ts'

import { Dialog, DialogContent } from './Dialog'
import type { ModalItem } from './ModalManager'
import { Modal, modalItemsAtom } from './ModalManager'
import { modalStore } from './store'
import type { ModalComponent } from './types'

export function ModalContainer() {
  const items = useAtomValue(modalItemsAtom, { store: modalStore })

  return (
    <div id="global-modal-container">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ModalWrapper key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ModalWrapper({ item }: { item: ModalItem }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    Modal.__registerCloser(item.id, () => setOpen(false))
    return () => {
      Modal.__unregisterCloser(item.id)
    }
  }, [item.id])

  const dismiss = useMemo(
    () => () => {
      setOpen(false)
    },
    [],
  )

  const handleOpenChange = (o: boolean) => {
    setOpen(o)
  }

  // After exit animation, remove from store
  const handleAnimationComplete = useEventCallback(() => {
    if (!open) {
      const items = modalStore.get(modalItemsAtom)
      modalStore.set(
        modalItemsAtom,
        items.filter((m) => m.id !== item.id),
      )
    }
  })

  const Component = item.component as ModalComponent<any>

  const { contentProps, contentClassName } = Component

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={clsxm('w-full max-w-md', contentClassName)}
        transition={Spring.presets.smooth}
        onAnimationComplete={handleAnimationComplete}
        {...contentProps}
        {...item.modalContent}
      >
        <Component modalId={item.id} dismiss={dismiss} {...(item.props as any)} />
      </DialogContent>
    </Dialog>
  )
}
