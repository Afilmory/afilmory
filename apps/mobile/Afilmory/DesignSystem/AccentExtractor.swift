import SDWebImage
import UIKit

enum AccentExtractor {
  static let fallbackHex = "#EDE9E3"

  private struct RGB {
    var red: Double
    var green: Double
    var blue: Double
  }

  static func accent(for image: UIImage) -> UIColor {
    UIColor(afHexString: accentHex(for: image)) ?? AFColor.accentFallback
  }

  static func accentHex(for image: UIImage) -> String {
    let pixels = samplePixels(image, maxSide: 64)
    guard !pixels.isEmpty, let winner = dominantSaturatedCluster(pixels) else { return fallbackHex }
    return hexString(of: clampToGround(lightened(winner)))
  }

  static func contrastRatio(_ first: UIColor, _ second: UIColor) -> Double {
    contrast(rgb(first), rgb(second))
  }

  private static func samplePixels(_ image: UIImage, maxSide: CGFloat) -> [RGB] {
    let size = image.size
    guard size.width > 0, size.height > 0 else { return [] }
    let scale = min(1, maxSide / max(size.width, size.height))
    let width = max(1, Int((size.width * scale).rounded()))
    let height = max(1, Int((size.height * scale).rounded()))
    var buffer = [UInt8](repeating: 0, count: width * height * 4)
    let drawn: Bool = buffer.withUnsafeMutableBytes { raw in
      guard let context = CGContext(
        data: raw.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else { return false }
      context.interpolationQuality = .medium
      UIGraphicsPushContext(context)
      context.translateBy(x: 0, y: CGFloat(height))
      context.scaleBy(x: 1, y: -1)
      image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
      UIGraphicsPopContext()
      return true
    }
    guard drawn else { return [] }
    return stride(from: 0, to: buffer.count, by: 4).compactMap { index in
      let alpha = Double(buffer[index + 3])
      guard alpha > 0 else { return nil }
      let unpremultiply = 255 / alpha
      return RGB(
        red: min(255, Double(buffer[index]) * unpremultiply),
        green: min(255, Double(buffer[index + 1]) * unpremultiply),
        blue: min(255, Double(buffer[index + 2]) * unpremultiply)
      )
    }
  }

  private static func dominantSaturatedCluster(_ pixels: [RGB]) -> RGB? {
    let hueBins = 12
    let saturationBins = 3
    let valueBins = 3
    var sums = [Int: (count: Int, red: Double, green: Double, blue: Double)]()
    for pixel in pixels {
      let (hue, saturation, value) = hsv(pixel)
      let key = min(Int(hue * Double(hueBins)), hueBins - 1) * 100
        + min(Int(saturation * Double(saturationBins)), saturationBins - 1) * 10
        + min(Int(value * Double(valueBins)), valueBins - 1)
      var entry = sums[key] ?? (0, 0, 0, 0)
      entry.count += 1
      entry.red += pixel.red
      entry.green += pixel.green
      entry.blue += pixel.blue
      sums[key] = entry
    }
    let total = Double(pixels.count)
    var best: RGB?
    var bestScore = 0.0
    for key in sums.keys.sorted() {
      guard let entry = sums[key] else { continue }
      let count = Double(entry.count)
      let mean = RGB(red: entry.red / count, green: entry.green / count, blue: entry.blue / count)
      let (_, saturation, value) = hsv(mean)
      guard saturation >= 0.28, value >= 0.28 else { continue }
      let score = pow(saturation, 3) * pow(count / total, 0.2) * (0.6 + 0.4 * value)
      if score > bestScore {
        best = mean
        bestScore = score
      }
    }
    return best
  }

  private static func lightened(_ color: RGB) -> RGB {
    let red = color.red / 255
    let green = color.green / 255
    let blue = color.blue / 255
    let maxValue = max(red, green, blue)
    let minValue = min(red, green, blue)
    let lightness = (maxValue + minValue) / 2
    let delta = maxValue - minValue
    var hue = 0.0
    var saturation = 0.0
    if delta > 0 {
      saturation = lightness <= 0.5 ? delta / (maxValue + minValue) : delta / (2 - maxValue - minValue)
      if maxValue == red {
        hue = (green - blue) / delta + (green < blue ? 6 : 0)
      } else if maxValue == green {
        hue = (blue - red) / delta + 2
      } else {
        hue = (red - green) / delta + 4
      }
      hue /= 6
    }
    return hslToRGB(hue: hue, saturation: min(1, max(saturation, 0.45)), lightness: 0.66)
  }

  private static func clampToGround(_ start: RGB) -> RGB {
    let ground = rgb(AFColor.ground)
    let white = RGB(red: 255, green: 255, blue: 255)
    var color = start
    for _ in 0..<40 {
      let ratio = contrast(color, ground)
      if ratio < 4.8 {
        color = mix(color, white, 0.05)
      } else if ratio > 9.5 {
        color = mix(color, ground, 0.05)
      } else {
        break
      }
    }
    return color
  }

  private static func hsv(_ color: RGB) -> (Double, Double, Double) {
    let red = color.red / 255
    let green = color.green / 255
    let blue = color.blue / 255
    let maxValue = max(red, green, blue)
    let minValue = min(red, green, blue)
    let delta = maxValue - minValue
    var hue = 0.0
    if delta > 0 {
      if maxValue == red {
        hue = ((green - blue) / delta).truncatingRemainder(dividingBy: 6)
      } else if maxValue == green {
        hue = (blue - red) / delta + 2
      } else {
        hue = (red - green) / delta + 4
      }
      hue /= 6
      if hue < 0 { hue += 1 }
    }
    return (hue, maxValue == 0 ? 0 : delta / maxValue, maxValue)
  }

  private static func hslToRGB(hue: Double, saturation: Double, lightness: Double) -> RGB {
    let q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
    let p = 2 * lightness - q
    func channel(_ offset: Double) -> Double {
      var t = hue + offset
      if t < 0 { t += 1 }
      if t > 1 { t -= 1 }
      if t < 1 / 6 { return p + (q - p) * 6 * t }
      if t < 1 / 2 { return q }
      if t < 2 / 3 { return p + (q - p) * (2 / 3 - t) * 6 }
      return p
    }
    return RGB(red: channel(1 / 3) * 255, green: channel(0) * 255, blue: channel(-1 / 3) * 255)
  }

  private static func luminance(_ color: RGB) -> Double {
    func channel(_ value: Double) -> Double {
      let normalized = value / 255
      return normalized <= 0.03928 ? normalized / 12.92 : pow((normalized + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)
  }

  private static func contrast(_ first: RGB, _ second: RGB) -> Double {
    let a = luminance(first)
    let b = luminance(second)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
  }

  private static func mix(_ from: RGB, _ to: RGB, _ amount: Double) -> RGB {
    RGB(
      red: from.red + (to.red - from.red) * amount,
      green: from.green + (to.green - from.green) * amount,
      blue: from.blue + (to.blue - from.blue) * amount
    )
  }

  private static func rgb(_ color: UIColor) -> RGB {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    color.getRed(&red, green: &green, blue: &blue, alpha: nil)
    return RGB(red: Double(red) * 255, green: Double(green) * 255, blue: Double(blue) * 255)
  }

  private static func hexString(of color: RGB) -> String {
    func channel(_ value: Double) -> Int { Int(min(255, max(0, value)).rounded()) }
    return String(format: "#%02X%02X%02X", channel(color.red), channel(color.green), channel(color.blue))
  }
}

@MainActor
final class AccentStore {
  static let shared = AccentStore()

  private var cache: [String: UIColor] = [:]
  private var waiters: [String: [(UIColor) -> Void]] = [:]

  func cachedAccent(photoId: String) -> UIColor? {
    cache[photoId]
  }

  func accent(photoId: String, thumbnailURL: URL?, completion: @escaping (UIColor) -> Void) {
    if let cached = cache[photoId] {
      completion(cached)
      return
    }
    if waiters[photoId] != nil {
      waiters[photoId]?.append(completion)
      return
    }
    guard let thumbnailURL else {
      completion(AFColor.accentFallback)
      return
    }
    waiters[photoId] = [completion]
    SDWebImageManager.shared.loadImage(with: thumbnailURL, options: [], progress: nil) { image, _, _, _, _, _ in
      guard let image else {
        Task { @MainActor in self.resolve(photoId, AFColor.accentFallback, store: false) }
        return
      }
      Task.detached(priority: .utility) {
        let hex = AccentExtractor.accentHex(for: image)
        await MainActor.run {
          self.resolve(photoId, UIColor(afHexString: hex) ?? AFColor.accentFallback, store: true)
        }
      }
    }
  }

  private func resolve(_ photoId: String, _ color: UIColor, store: Bool) {
    if store { cache[photoId] = color }
    let pending = waiters.removeValue(forKey: photoId) ?? []
    pending.forEach { $0(color) }
  }
}
