import Photos
import UIKit

struct DarkroomPick: Equatable, Sendable {
  enum Source: Equatable, Sendable {
    case library(isLivePhoto: Bool)
    case file(URL)
  }

  let id: String
  let name: String
  let aspectRatio: Double
  let source: Source

  static func fromLibrary(_ picked: [UploadPickedPhoto]) -> [DarkroomPick] {
    var assets: [String: PHAsset] = [:]
    PHAsset.fetchAssets(withLocalIdentifiers: picked.map(\.id), options: nil).enumerateObjects { asset, _, _ in
      assets[asset.localIdentifier] = asset
    }
    return picked.map { item in
      let asset = assets[item.id]
      let ratio = asset.map { Double($0.pixelWidth) / Double(max(1, $0.pixelHeight)) } ?? 1
      return DarkroomPick(id: item.id, name: item.name, aspectRatio: ratio, source: .library(isLivePhoto: item.isLivePhoto))
    }
  }

  static func fromFile(_ url: URL) -> DarkroomPick? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Double,
          let height = properties[kCGImagePropertyPixelHeight] as? Double
    else { return nil }
    let orientation = properties[kCGImagePropertyOrientation] as? UInt32 ?? 1
    let rotated = orientation >= 5
    let ratio = rotated ? height / max(1, width) : width / max(1, height)
    return DarkroomPick(id: url.lastPathComponent, name: url.lastPathComponent, aspectRatio: ratio, source: .file(url))
  }

  func loadThumbnail(height: CGFloat, scale: CGFloat, completion: @escaping @MainActor (UIImage?) -> Void) {
    let pixelHeight = height * scale
    let target = CGSize(width: pixelHeight * CGFloat(aspectRatio), height: pixelHeight)
    switch source {
    case .library:
      let options = PHImageRequestOptions()
      options.deliveryMode = .opportunistic
      options.isNetworkAccessAllowed = true
      options.resizeMode = .fast
      guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
        Task { @MainActor in completion(nil) }
        return
      }
      PHImageManager.default().requestImage(for: asset, targetSize: target, contentMode: .aspectFill, options: options) { image, _ in
        let sendable = image
        Task { @MainActor in completion(sendable) }
      }
    case .file(let url):
      Task.detached(priority: .userInitiated) {
        let options: [CFString: Any] = [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: max(target.width, target.height),
        ]
        let image = CGImageSourceCreateWithURL(url as CFURL, nil)
          .flatMap { CGImageSourceCreateThumbnailAtIndex($0, 0, options as CFDictionary) }
          .map { UIImage(cgImage: $0) }
        await completion(image)
      }
    }
  }
}

#if DEBUG
  enum DarkroomFixturePicks {
    static let names = ["IMG_5469", "IMG_5484", "DSCF0842", "DSCF4632"]

    static func picks() -> [DarkroomPick] {
      names.compactMap { Bundle.main.url(forResource: $0, withExtension: "jpg") }.compactMap(DarkroomPick.fromFile)
    }
  }
#endif
