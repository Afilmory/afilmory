import Foundation

struct PhotoInfoGear: Codable, Equatable, Sendable {
  let model: String
  let formatBadge: String?
  let styleBadge: String?
  let lens: String?
  let rating: Int
  let specs: [String]
  let tone: String?
  let exposure: [String]

  static func build(
    photo: GalleryPhoto,
    exif: GalleryExif?,
    localeIdentifier: String
  ) -> PhotoInfoGear {
    let lens = PhotoInfoFormatters.joinMakeAndModel(exif?["LensMake"], exif?["LensModel"])
      ?? PhotoInfoFormatters.text(photo.lens)
    let model = PhotoInfoFormatters.joinMakeAndModel(exif?["Make"], exif?["Model"])
      ?? PhotoInfoFormatters.text(photo.camera)
      ?? PhotoInfoFormatters.text(photo.title)
      ?? ""
    return PhotoInfoGear(
      model: model,
      formatBadge: PhotoInfoFormatters.text(photo.format)?.uppercased(),
      styleBadge: PhotoInfoFormatters.formatFilmMode(exif?["FujiRecipe"]?.object?["FilmMode"]),
      lens: lens,
      rating: min(5, max(0, photo.rating ?? 0)),
      specs: [
        PhotoInfoFormatters.formatMegapixels(photo.width, photo.height, localeIdentifier: localeIdentifier),
        PhotoInfoFormatters.formatDimensions(photo.width, photo.height),
        PhotoInfoFormatters.formatFileSize(photo.size, localeIdentifier: localeIdentifier),
      ].compactMap { $0 },
      tone: PhotoInfoFormatters.formatToneType(photo.toneAnalysis),
      exposure: [
        PhotoInfoFormatters.formatISO(exif?["ISO"]),
        PhotoInfoFormatters.formatFocalPair(exif?["FocalLength"], exif?["FocalLengthIn35mmFormat"]),
        PhotoInfoFormatters.formatExposureBias(exif?["ExposureCompensation"], localeIdentifier: localeIdentifier),
        PhotoInfoFormatters.formatApertureGlyph(exif?["FNumber"]),
        PhotoInfoFormatters.formatExposureTime(
          exif?["ExposureTime"] ?? exif?["ShutterSpeedValue"] ?? exif?["ShutterSpeed"],
          localeIdentifier: localeIdentifier
        ),
      ].compactMap { $0 }
    )
  }
}
