import { useAtom } from 'jotai'
import { useEffect } from 'react'

import { isCommandPaletteOpenAtom } from '~/atoms/app'

export const useCommandPaletteShortcut = () => {
  const [isOpen, setIsOpen] = useAtom(isCommandPaletteOpenAtom)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // cmd+k on macOS, ctrl+k on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setIsOpen])

  return { isOpen, setIsOpen }
}
