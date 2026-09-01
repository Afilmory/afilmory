import Foundation

struct DailyPhotoPick: Equatable, Sendable {
  let day: Date
  let photoId: String
}

enum DailyPhotoPicker {
  static let dayCount = 7

  static func pick(
    photoIds: [String],
    slug: String,
    startingAt date: Date,
    dayCount: Int = dayCount,
    calendar: Calendar = Calendar(identifier: .gregorian)
  ) -> [DailyPhotoPick] {
    guard !photoIds.isEmpty, dayCount > 0 else { return [] }
    let firstDay = calendar.startOfDay(for: date)
    return (0 ..< dayCount).compactMap { offset in
      guard let day = calendar.date(byAdding: .day, value: offset, to: firstDay) else { return nil }
      let dayNumber = Int(floor(day.timeIntervalSince1970 / 86400))
      let index = Int(seed(dayNumber: dayNumber, slug: slug) % UInt64(photoIds.count))
      return DailyPhotoPick(day: day, photoId: photoIds[index])
    }
  }

  private static func seed(dayNumber: Int, slug: String) -> UInt64 {
    var value: UInt64 = 0xCBF2_9CE4_8422_2325
    for byte in slug.utf8 {
      value = (value ^ UInt64(byte)) &* 0x0000_0100_0000_01B3
    }
    var remaining = UInt64(bitPattern: Int64(dayNumber))
    for _ in 0 ..< 8 {
      value = (value ^ (remaining & 0xFF)) &* 0x0000_0100_0000_01B3
      remaining >>= 8
    }
    return value
  }
}
