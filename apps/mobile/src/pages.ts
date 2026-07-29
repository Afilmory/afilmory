import { galleriesPage } from '@/modules/galleries/galleriesPage'
import { galleryDetailPage } from '@/modules/galleries/galleryDetailPage'
import { photosPage } from '@/modules/photos/photosPage'
import { settingsPage } from '@/modules/settings/settingsPage'

export const Pages = {
  galleries: galleriesPage,
  galleryDetail: galleryDetailPage,
  photos: photosPage,
  settings: settingsPage,
} as const
