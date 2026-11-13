import type { CanvasPhoto } from './types'

export const sameLayoutInput = (a: CanvasPhoto[], b: CanvasPhoto[]) =>
  a.length === b.length
  && a.every((photo, index) => {
    const other = b[index]
    return (
      photo.id === other.id
      && photo.aspectRatio === other.aspectRatio
      && photo.dateTaken === other.dateTaken
      && photo.camera === other.camera
      && photo.place === other.place
      && (photo.thumbHash === null) === (other.thumbHash === null)
      && photo.tags.length === other.tags.length
      && photo.tags.every((tag, tagIndex) => tag === other.tags[tagIndex])
    )
  })
