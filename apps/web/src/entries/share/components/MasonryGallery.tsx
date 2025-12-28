import type { PhotoManifestItem } from '@afilmory/builder'
import { useMemo } from 'react'
import Masonry from 'react-responsive-masonry'
import { useWindowSize } from 'usehooks-ts'

import { PhotoItem } from './PhotoItem'

interface MasonryGalleryProps {
  photos: PhotoManifestItem[]
}

export function MasonryGallery({ photos }: MasonryGalleryProps) {
  const { width } = useWindowSize()

  const columnsCount = useMemo(() => {
    if (width < 600) return 1
    if (width < 800) return 2
    return 3
  }, [width])
  return (
    <div className="scrollbar-none h-screen overflow-auto">
      <Masonry gutter="4px" columnsCount={columnsCount}>
        {photos.map((photo) => (
          <PhotoItem key={photo.id} photo={photo} />
        ))}
      </Masonry>
    </div>
  )
}
