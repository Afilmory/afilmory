import Foundation

struct DuoInfoModel: Equatable, Sendable {
  struct Value: Equatable, Sendable {
    let value: String
    let label: String
  }

  let number: String
  let title: String
  let isUserTitle: Bool
  let meta: String?
  let tags: [String]
  let exposure: [Value]
  let tone: DetailSection?
  let extras: [DetailSection]
  let place: String?
  let hasLocation: Bool

  static func make(photo: GalleryPhoto, number: Int, localeIdentifier: String) -> DuoInfoModel {
    let info = PhotoInfoModel.build(photo: photo, localeIdentifier: localeIdentifier)
    let sheet = DetailSheetModel.make(photo: photo, number: number, localeIdentifier: localeIdentifier)
    let headline = ExhibitFormat.headline(for: photo)
    let stamp = ExhibitFormat.localDateTime(for: photo)
    let title: String
    let isUserTitle: Bool
    switch headline {
    case .title(let text):
      title = text
      isUserTitle = true
    case .date(let date):
      title = date
      isUserTitle = false
    case nil:
      title = String(localized: "No. \(ExhibitFormat.frameNumber(number))")
      isUserTitle = false
    }
    let moment = stamp.map { "\($0.timeOfDay.localizedName) \($0.time)" }
    let meta = [isUserTitle ? stamp?.date : nil, moment, info.place, ExhibitFormat.camera(for: photo)]
      .compactMap { $0 }
      .joined(separator: " · ")
    var exposure = ExhibitFormat.exposureParts(for: photo).map { Value(value: $0.value, label: label(for: $0.kind)) }
    var tone: DetailSection?
    var extras: [DetailSection] = []
    for section in sheet.sections {
      switch section {
      case .exposure(let rows):
        exposure += rows.map { Value(value: $0.value, label: $0.label) }
      case .tone:
        tone = section
      case .location:
        continue
      default:
        extras.append(section)
      }
    }
    return DuoInfoModel(
      number: sheet.number,
      title: title,
      isUserTitle: isUserTitle,
      meta: meta.isEmpty ? nil : meta,
      tags: sheet.tags,
      exposure: exposure,
      tone: tone,
      extras: extras,
      place: info.place,
      hasLocation: photo.coordinates != nil
    )
  }

  private static func label(for kind: ExhibitFormat.ExposureKind) -> String {
    switch kind {
    case .focalLength: String(localized: "Focal Length")
    case .aperture: String(localized: "Aperture")
    case .shutter: String(localized: "Shutter")
    case .iso: String(localized: "Sensitivity")
    case .bias: String(localized: "Exposure Comp.")
    }
  }
}
