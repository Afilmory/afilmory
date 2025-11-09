import { useEffect, useRef } from 'react'

import { siteConfig } from '~/config'

const titleTemplate = `%s | ${siteConfig.name}`
export const useTitle = (title?: Nullable<string>) => {
  const currentTitleRef = useRef(document.title)
  useEffect(() => {
    if (!title) return

    document.title = titleTemplate.replace('%s', title)
    return () => {
      document.title = currentTitleRef.current
    }
  }, [title])
}
