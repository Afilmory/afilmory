import { Modal, Prompt } from '@afilmory/ui'
import { useCallback, useEffect, useRef } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router'

type UseBlockOptions = {
  when: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'info'
  beforeUnloadMessage?: string
}

const DEFAULT_TITLE = '您有尚未保存的变更'
const DEFAULT_DESCRIPTION = '离开当前页面会丢失未保存的更改，确定要继续吗？'
const DEFAULT_CONFIRM_TEXT = '继续离开'
const DEFAULT_CANCEL_TEXT = '留在此页'
const DEFAULT_BEFORE_UNLOAD_MESSAGE = '您有未保存的更改，确定要离开吗？'

export function useBlock({
  when,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  confirmText = DEFAULT_CONFIRM_TEXT,
  cancelText = DEFAULT_CANCEL_TEXT,
  variant = 'danger',
  beforeUnloadMessage = DEFAULT_BEFORE_UNLOAD_MESSAGE,
}: UseBlockOptions) {
  const promptIdRef = useRef<string | null>(null)
  const isPromptOpenRef = useRef(false)

  const blocker = useBlocker(when)

  const closePrompt = useCallback((dismissModal = false) => {
    if (!isPromptOpenRef.current) {
      promptIdRef.current = null
      return
    }

    if (dismissModal && promptIdRef.current) {
      Modal.dismiss(promptIdRef.current)
    }

    promptIdRef.current = null
    isPromptOpenRef.current = false
  }, [])

  const openPrompt = useCallback(() => {
    if (isPromptOpenRef.current) {
      return
    }

    if (blocker.state !== 'blocked') {
      return
    }

    isPromptOpenRef.current = true
    promptIdRef.current = Prompt.prompt({
      title,
      description,
      onConfirmText: confirmText,
      onCancelText: cancelText,
      variant,
      onConfirm: async () => {
        closePrompt()
        blocker.proceed?.()
      },
      onCancel: async () => {
        closePrompt()
        blocker.reset?.()
      },
    })
  }, [blocker, cancelText, closePrompt, confirmText, description, title, variant])

  useEffect(() => {
    if (!when) {
      if (blocker.state === 'blocked') {
        blocker.reset?.()
      }
      closePrompt(true)
      return
    }

    if (blocker.state === 'blocked') {
      openPrompt()
      return
    }

    if (blocker.state === 'unblocked' || blocker.state === 'proceeding') {
      closePrompt()
    }
  }, [blocker, closePrompt, openPrompt, when])

  useBeforeUnload((event) => {
    if (!when) {
      return
    }

    event.preventDefault()
    event.returnValue = beforeUnloadMessage
  })
}
