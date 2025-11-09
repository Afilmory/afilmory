import { createContext } from 'react'

import type { PhotoManifest } from '~/types/photo'

export const PhotosContext = createContext<PhotoManifest[]>(null!)

export const PhotosProvider = ({ children, photos }: { children: React.ReactNode; photos: PhotoManifest[] }) => {
  return <PhotosContext value={photos}>{children}</PhotosContext>
}
