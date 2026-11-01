import SDWebImage
import UIKit

enum PhotoImageSizing {
  static let maxPixelEdge: CGFloat = 4096
  static let memoryCacheCost: UInt = 256 * 1024 * 1024

  static func configure(_ cache: SDImageCache) {
    cache.config.maxMemoryCost = memoryCacheCost
  }

  static func pixelSize(aspectRatio: Double, fitting points: CGSize, scale: CGFloat, headroom: CGFloat = 1) -> CGSize {
    let ratio = CGFloat(max(aspectRatio, 0.01))
    let box = CGSize(width: points.width * scale * headroom, height: points.height * scale * headroom)
    var width = box.width
    var height = width / ratio
    if height > box.height {
      height = box.height
      width = height * ratio
    }
    let longest = max(width, height)
    guard longest > maxPixelEdge else { return CGSize(width: width, height: height) }
    let shrink = maxPixelEdge / longest
    return CGSize(width: width * shrink, height: height * shrink)
  }

  static func context(aspectRatio: Double, fitting points: CGSize, scale: CGFloat, headroom: CGFloat = 1) -> [SDWebImageContextOption: Any] {
    let size = pixelSize(aspectRatio: aspectRatio, fitting: points, scale: scale, headroom: headroom)
    return [.imageThumbnailPixelSize: NSValue(cgSize: size)]
  }
}
