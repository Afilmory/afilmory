import UIKit

@MainActor
enum ThumbHashCache {
  private static let cache = NSCache<NSString, UIImage>()

  static func image(forHex hex: String?) -> UIImage? {
    guard let hex, !hex.isEmpty else { return nil }
    if let cached = cache.object(forKey: hex as NSString) {
      return cached
    }
    guard let data = Data(thumbHashHex: hex) else { return nil }
    let image = thumbHashToImage(hash: data)
    cache.setObject(image, forKey: hex as NSString)
    return image
  }
}

private extension Data {
  init?(thumbHashHex hex: String) {
    let length = hex.count
    guard length >= 2, length % 2 == 0 else { return nil }
    var bytes = [UInt8]()
    bytes.reserveCapacity(length / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
      bytes.append(byte)
      index = next
    }
    self.init(bytes)
  }
}
