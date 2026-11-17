import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import { useCreateSpace } from '../lib/create-space'
import { SpaceModal } from './SpaceModal'

export interface CreateSpaceModalProps {
  open: boolean
  onClose: () => void
  locale: Locale
}

export function CreateSpaceModal({ open, onClose, locale }: CreateSpaceModalProps) {
  const copy = translate(locale).createModal
  const [name, setName] = useState('')
  const { submit, pending, error, reset } = useCreateSpace(copy)

  useEffect(() => {
    if (open) {
      setName('')
      reset()
    }
  }, [open, reset])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit(name)
  }

  return (
    <SpaceModal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      closeLabel={copy.close}
      inputLabel={copy.inputLabel}
      placeholder={copy.placeholder}
      domainSuffix={copy.domainSuffix}
      value={name}
      onValueChange={setName}
      onSubmit={onSubmit}
      submitLabel={pending ? copy.buttonPending : copy.button}
      pending={pending}
      error={error}
    >
      <ul className="lp-modal-tips">
        {copy.tips.map(tip => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </SpaceModal>
  )
}
