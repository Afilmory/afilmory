import Foundation

struct PhotoInfoRow: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let label: String
  let value: String
}

struct PhotoInfoSection: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  let summary: String?
  let rows: [PhotoInfoRow]
}

struct PhotoInfoMapLocation: Codable, Equatable, Sendable {
  let latitude: Double
  let longitude: Double
}

struct PhotoInfoSheetModel: Codable, Equatable, Sendable {
  let gear: PhotoInfoGear
  let description: String?
  let emptyMessage: String?
  let histogramUrl: String?
  let mapLocation: PhotoInfoMapLocation?
  let place: String?
  let sections: [PhotoInfoSection]
  let tags: [String]

  static let empty = PhotoInfoSheetModel(
    gear: PhotoInfoGear(
      model: "",
      formatBadge: nil,
      styleBadge: nil,
      lens: nil,
      rating: 0,
      specs: [],
      tone: nil,
      exposure: []
    ),
    description: nil,
    emptyMessage: nil,
    histogramUrl: nil,
    mapLocation: nil,
    place: nil,
    sections: [],
    tags: []
  )
}

enum PhotoInfoModel {
  static func build(
    photo: GalleryPhoto,
    localeIdentifier: String,
    timeZone: TimeZone = .current
  ) -> PhotoInfoSheetModel {
    let exif = photo.exif
    var sections: [PhotoInfoSection] = []
    if let exif {
      if let section = exposureSection(exif: exif) {
        sections.append(section)
      }
      if let section = fujiSection(recipe: exif["FujiRecipe"]?.object) {
        sections.append(section)
      }
    }
    if let section = toneSection(photo: photo) {
      sections.append(section)
    }
    if let section = locationSection(photo: photo, exif: exif) {
      sections.append(section)
    }
    if let section = fileSection(
      photo: photo,
      exif: exif,
      localeIdentifier: localeIdentifier,
      timeZone: timeZone
    ) {
      sections.append(section)
    }
    if let section = attributionSection(exif: exif) {
      sections.append(section)
    }
    return PhotoInfoSheetModel(
      gear: PhotoInfoGear.build(
        photo: photo,
        exif: exif,
        localeIdentifier: localeIdentifier
      ),
      description: photo.description.isEmpty ? nil : photo.description,
      emptyMessage: exif == nil ? String(localized: "No embedded EXIF metadata is available for this photo.") : nil,
      histogramUrl: photo.toneAnalysis == nil ? nil : photo.thumbnailUrl,
      mapLocation: mapLocation(photo: photo, exif: exif),
      place: place(photo: photo),
      sections: sections,
      tags: photo.tags
    )
  }

  private static func exposureSection(
    exif: GalleryExif
  ) -> PhotoInfoSection? {
    let hasRecipe = exif["FujiRecipe"] != nil
    let summary = PhotoInfoFormatters.translatedExifValue(
      prefix: "exif.exposureprogram",
      value: exif["ExposureProgram"]
    )
    let x = PhotoInfoFormatters.text(exif["FocalPlaneXResolution"])
    let y = PhotoInfoFormatters.text(exif["FocalPlaneYResolution"])
    return section(
      id: "exposure",
      title: String(localized: "Exposure & Metering"),
      summary: summary,
      rows: [
        row(
          id: "exposure-program",
          label: String(localized: "Exposure Program"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.exposureprogram",
            value: exif["ExposureProgram"]
          )
        ),
        row(
          id: "exposure-mode",
          label: String(localized: "Exposure Mode"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.exposure.mode",
            value: exif["ExposureMode"]
          )
        ),
        row(
          id: "metering-mode",
          label: String(localized: "Metering Mode"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.metering.mode",
            value: exif["MeteringMode"]
          )
        ),
        row(
          id: "white-balance",
          label: String(localized: "White Balance"),
          value: hasRecipe ? nil : PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.white.balance",
            value: exif["WhiteBalance"]
          )
        ),
        row(
          id: "white-balance-bias",
          label: String(localized: "White Balance Bias"),
          value: PhotoInfoFormatters.formatMired(exif["WhiteBalanceBias"])
        ),
        row(
          id: "white-balance-ab",
          label: String(localized: "White Balance Shift (Amber-Blue)"),
          value: PhotoInfoFormatters.text(exif["WBShiftAB"])
        ),
        row(
          id: "white-balance-gm",
          label: String(localized: "White Balance Shift (Green-Magenta)"),
          value: PhotoInfoFormatters.text(exif["WBShiftGM"])
        ),
        row(
          id: "flash",
          label: String(localized: "Flash"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.flash",
            value: exif["Flash"]
          )
        ),
        row(
          id: "flash-metering",
          label: String(localized: "Flash Metering Mode"),
          value: PhotoInfoFormatters.text(exif["FlashMeteringMode"])
        ),
        row(
          id: "light-source",
          label: String(localized: "Light Source"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.light.source",
            value: exif["LightSource"]
          )
        ),
        row(
          id: "scene-type",
          label: String(localized: "Scene Capture Type"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.scene.capture",
            value: exif["SceneCaptureType"]
          )
        ),
        row(
          id: "brightness",
          label: String(localized: "Brightness Value"),
          value: PhotoInfoFormatters.formatEV(exif["BrightnessValue"])
        ),
        row(
          id: "sensing-method",
          label: String(localized: "Sensing Method"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.sensing.method",
            value: exif["SensingMethod"]
          )
        ),
        row(
          id: "focal-plane",
          label: String(localized: "Focal Plane Resolution"),
          value: x == nil && y == nil ? nil : "\(x ?? "—") × \(y ?? "—")"
        ),
      ]
    )
  }

  private static func fujiSection(
    recipe: [String: JSONValue]?
  ) -> PhotoInfoSection? {
    guard let recipe else { return nil }
    return section(
      id: "fuji-recipe",
      title: String(localized: "Film Simulation"),
      summary: PhotoInfoFormatters.formatFilmMode(recipe["FilmMode"]),
      rows: [
        row(
          id: "film-mode",
          label: String(localized: "Film Mode"),
          value: PhotoInfoFormatters.formatFilmMode(recipe["FilmMode"])
        ),
        row(
          id: "dynamic-range",
          label: String(localized: "Dynamic Range"),
          value: PhotoInfoFormatters.formatFujiDynamicRange(recipe)
        ),
        row(
          id: "white-balance",
          label: String(localized: "White Balance"),
          value: PhotoInfoFormatters.formatFujiWhiteBalance(recipe)
        ),
        row(
          id: "highlight-tone",
          label: String(localized: "Highlight Tone"),
          value: PhotoInfoFormatters.cleanRecipeValue(recipe["HighlightTone"])
        ),
        row(
          id: "shadow-tone",
          label: String(localized: "Shadow Tone"),
          value: PhotoInfoFormatters.cleanRecipeValue(recipe["ShadowTone"])
        ),
        row(
          id: "saturation",
          label: String(localized: "Saturation"),
          value: PhotoInfoFormatters.cleanRecipeValue(recipe["Saturation"])
        ),
        row(
          id: "sharpness",
          label: String(localized: "Sharpness"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.fujirecipe-sharpness",
            value: recipe["Sharpness"]
          )
        ),
        row(
          id: "noise-reduction",
          label: String(localized: "Noise Reduction"),
          value: PhotoInfoFormatters.cleanRecipeValue(recipe["NoiseReduction"])
        ),
        row(
          id: "clarity",
          label: String(localized: "Clarity"),
          value: PhotoInfoFormatters.text(recipe["Clarity"])
        ),
        row(
          id: "color-chrome",
          label: String(localized: "Color Effect"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.fujirecipe-colorchromeeffect",
            value: recipe["ColorChromeEffect"]
          )
        ),
        row(
          id: "color-chrome-blue",
          label: String(localized: "Blue Color Effect"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.fujirecipe-colorchromefxblue",
            value: recipe["ColorChromeFxBlue"]
          )
        ),
        row(
          id: "white-balance-fine-tune",
          label: String(localized: "White Balance Fine Tune"),
          value: PhotoInfoFormatters.text(recipe["WhiteBalanceFineTune"])
        ),
        row(
          id: "grain-intensity",
          label: String(localized: "Grain Effect Intensity"),
          value: PhotoInfoFormatters.text(recipe["GrainEffectRoughness"])
        ),
        row(
          id: "grain-size",
          label: String(localized: "Grain Effect Size"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.fujirecipe-graineffectsize",
            value: recipe["GrainEffectSize"]
          )
        ),
      ]
    )
  }

  private static func toneSection(
    photo: GalleryPhoto
  ) -> PhotoInfoSection? {
    guard let tone = photo.toneAnalysis else { return nil }
    let brightness = PhotoInfoFormatters.formatPercentage(tone.brightness, scale: 1)
    return section(
      id: "tone",
      title: String(localized: "Tone"),
      summary: brightness,
      rows: [
        row(id: "brightness", label: String(localized: "Brightness"), value: brightness),
        row(
          id: "contrast",
          label: String(localized: "Contrast"),
          value: PhotoInfoFormatters.formatPercentage(tone.contrast, scale: 1)
        ),
        row(
          id: "shadow-ratio",
          label: String(localized: "Shadow Ratio"),
          value: PhotoInfoFormatters.formatPercentage(tone.shadowRatio, scale: 100)
        ),
        row(
          id: "highlight-ratio",
          label: String(localized: "Highlight Ratio"),
          value: PhotoInfoFormatters.formatPercentage(tone.highlightRatio, scale: 100)
        ),
      ]
    )
  }

  private static func locationSection(
    photo: GalleryPhoto,
    exif: GalleryExif?
  ) -> PhotoInfoSection? {
    let altitude = PhotoInfoFormatters.formatAltitude(exif)
    return section(
      id: "location",
      title: String(localized: "Location Details"),
      summary: altitude,
      rows: [
        row(
          id: "latitude",
          label: String(localized: "Latitude"),
          value: PhotoInfoFormatters.formatCoordinate(
            exif?["GPSLatitude"] ?? photo.location?.latitude.map(JSONValue.number),
            reference: exif?["GPSLatitudeRef"]
          )
        ),
        row(
          id: "longitude",
          label: String(localized: "Longitude"),
          value: PhotoInfoFormatters.formatCoordinate(
            exif?["GPSLongitude"] ?? photo.location?.longitude.map(JSONValue.number),
            reference: exif?["GPSLongitudeRef"]
          )
        ),
        row(id: "altitude", label: String(localized: "Altitude"), value: altitude),
        row(
          id: "address",
          label: String(localized: "Address"),
          value: photo.location?.locationName
        ),
      ]
    )
  }

  private static func fileSection(
    photo: GalleryPhoto,
    exif: GalleryExif?,
    localeIdentifier: String,
    timeZone: TimeZone
  ) -> PhotoInfoSection? {
    let filename = PhotoInfoFormatters.text(photo.title)
    return section(
      id: "file",
      title: String(localized: "Image & File"),
      summary: filename,
      rows: [
        row(id: "filename", label: String(localized: "Filename"), value: filename),
        row(
          id: "color-space",
          label: String(localized: "Color Space"),
          value: PhotoInfoFormatters.translatedExifValue(
            prefix: "exif.colorspace",
            value: exif?["ColorSpace"]
          )
        ),
        row(
          id: "capture-time",
          label: String(localized: "Capture Time"),
          value: PhotoInfoFormatters.formatDate(
            PhotoInfoFormatters.text(exif?["DateTimeOriginal"]) ?? photo.dateTaken,
            localeIdentifier: localeIdentifier,
            timeZone: timeZone
          )
        ),
        row(
          id: "time-zone",
          label: String(localized: "Time Zone"),
          value: PhotoInfoFormatters.text(exif?["zone"] ?? exif?["tz"])
        ),
      ]
    )
  }

  private static func attributionSection(
    exif: GalleryExif?
  ) -> PhotoInfoSection? {
    let artist = PhotoInfoFormatters.text(exif?["Artist"])
    return section(
      id: "attribution",
      title: String(localized: "Attribution"),
      summary: artist,
      rows: [
        row(id: "artist", label: String(localized: "Artist"), value: artist),
        row(
          id: "copyright",
          label: String(localized: "Copyright"),
          value: PhotoInfoFormatters.text(exif?["Copyright"])
        ),
        row(
          id: "software",
          label: String(localized: "Software"),
          value: PhotoInfoFormatters.text(exif?["Software"])
        ),
      ]
    )
  }

  private static func mapLocation(photo: GalleryPhoto, exif: GalleryExif?) -> PhotoInfoMapLocation? {
    let latitude = PhotoInfoFormatters.decimalCoordinate(
      exif?["GPSLatitude"] ?? photo.location?.latitude.map(JSONValue.number),
      reference: exif?["GPSLatitudeRef"],
      limit: 90
    )
    let longitude = PhotoInfoFormatters.decimalCoordinate(
      exif?["GPSLongitude"] ?? photo.location?.longitude.map(JSONValue.number),
      reference: exif?["GPSLongitudeRef"],
      limit: 180
    )
    guard let latitude, let longitude else { return nil }
    return PhotoInfoMapLocation(latitude: latitude, longitude: longitude)
  }

  private static func place(photo: GalleryPhoto) -> String? {
    let city = PhotoInfoFormatters.text(photo.location?.city) ?? PhotoInfoFormatters.text(photo.city)
    let country = PhotoInfoFormatters.text(photo.location?.country)
    if let city, let country, city.compare(country, options: .caseInsensitive) == .orderedSame {
      return city
    }
    return [city, country].compactMap { $0 }.joined(separator: ", ").trimmingToNil
  }

  private static func row(id: String, label: String, value: String?) -> PhotoInfoRow? {
    value.map { PhotoInfoRow(id: id, label: label, value: $0) }
  }

  private static func section(
    id: String,
    title: String,
    summary: String?,
    rows: [PhotoInfoRow?]
  ) -> PhotoInfoSection? {
    let rows = rows.compactMap { $0 }
    return rows.isEmpty ? nil : PhotoInfoSection(id: id, title: title, summary: summary, rows: rows)
  }
}
