import type { PhotoManifestItem } from '@afilmory/builder'
import { notFound } from 'next/navigation'

import { photoLoader } from '~/lib/photo-loader'

import { MasonryGallery } from './MasonryGallery'
import { PhotoItem } from './PhotoItem'

export default async function Page({ searchParams }: NextPageExtractedParams<unknown>) {
  const { id } = await searchParams

  let photos: PhotoManifestItem[] = []

  if (!id) return notFound()
  if (typeof id === 'string') {
    const photo = await photoLoader.getPhoto(id)
    if (!photo) {
      notFound()
    }
    photos = [photo]
  } else {
    photos = await photoLoader.getPhotos(id)
    if (photos.length === 0) {
      notFound()
    }
  }

  if (photos.length === 1) {
    return <PhotoItem photo={photos[0]} className="absolute inset-0 size-full !pt-0" />
  }

  return (
    <div className="h-screen bg-[#0a0a0a] text-white">
      <MasonryGallery photos={photos} />
    </div>
  )
}
