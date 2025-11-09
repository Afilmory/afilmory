import { clsxm, decompressUint8Array } from '@afilmory/utils'
import { useMemo } from 'react'
import { thumbHashToDataURL } from 'thumbhash'

export const Thumbhash = ({ thumbHash, className }: { thumbHash: ArrayLike<number> | string; className?: string }) => {
  const dataURL = useMemo(() => {
    if (typeof thumbHash === 'string') {
      return thumbHashToDataURL(decompressUint8Array(thumbHash))
    }
    return thumbHashToDataURL(thumbHash)
  }, [thumbHash])

  return <img src={dataURL} className={clsxm('h-full w-full', className)} />
}
