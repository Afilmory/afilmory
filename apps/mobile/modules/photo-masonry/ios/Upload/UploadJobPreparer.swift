import Foundation
import ImageIO
import Photos
import UIKit
import UniformTypeIdentifiers

enum UploadPrepareError: LocalizedError {
  case assetUnavailable
  case mismatchedLivePhotoResources
  case resourceUnreadable(String)
  case stagedAssetEmpty
  case unsupportedLivePhotoResources

  var errorDescription: String? {
    switch self {
    case .assetUnavailable:
      return "The photo is no longer available in the photo library."
    case .mismatchedLivePhotoResources:
      return "The Live Photo image and video must have the same base filename."
    case .resourceUnreadable(let message):
      return message
    case .stagedAssetEmpty:
      return "The staged upload does not contain a photo."
    case .unsupportedLivePhotoResources:
      return "The Live Photo does not contain a HEIC still and MOV paired video."
    }
  }
}

struct UploadPreparedBody {
  let name: String
  let bytes: Int64
}

enum UploadJobPreparer {
  static func fetchAsset(_ assetId: String) -> PHAsset? {
    PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil).firstObject
  }

  static func writePreview(for asset: PHAsset, to url: URL) {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    // .fastFormat fails with PHPhotosErrorDomain 3303 for assets whose cached
    // thumbnail is absent; a network-allowed high-quality request always
    // decodes from the original instead.
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    options.isNetworkAccessAllowed = true
    var thumbnail: UIImage?
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: CGSize(width: 192, height: 192),
      contentMode: .aspectFill,
      options: options
    ) { image, _ in
      thumbnail = image
    }
    guard let data = thumbnail?.jpegData(compressionQuality: 0.75) else { return }
    try? data.write(to: url, options: .atomic)
  }

  static func writePreview(forFileAt sourceURL: URL, to destinationURL: URL) {
    guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else { return }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 384,
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
          let data = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.75)
    else { return }
    try? data.write(to: destinationURL, options: .atomic)
  }

  static func buildBody(
    for asset: PHAsset,
    directory: String?,
    boundary: String,
    to url: URL
  ) throws -> UploadPreparedBody {
    let resources = PHAssetResource.assetResources(for: asset)
    let isLivePhoto = asset.mediaSubtypes.contains(.photoLive)
    let photo: PHAssetResource
    let video: PHAssetResource?
    if isLivePhoto {
      let originalPhoto = resources.first(where: {
        $0.type == .photo && resourceExtension($0) == "heic"
      })
      let renderedPhoto = resources.first(where: {
        $0.type == .fullSizePhoto && resourceExtension($0) == "heic"
      })
      let originalVideo = resources.first(where: {
        $0.type == .pairedVideo && resourceExtension($0) == "mov"
      })
      let renderedVideo = resources.first(where: {
        $0.type == .fullSizePairedVideo && resourceExtension($0) == "mov"
      })
      guard let livePhoto = originalPhoto ?? renderedPhoto,
            let pairedVideo = originalVideo ?? renderedVideo
      else {
        throw UploadPrepareError.unsupportedLivePhotoResources
      }
      photo = livePhoto
      video = pairedVideo
    } else {
      guard let still = resources.first(where: { $0.type == .fullSizePhoto })
        ?? resources.first(where: { $0.type == .photo })
      else {
        throw UploadPrepareError.assetUnavailable
      }
      photo = still
      video = nil
    }

    // The server pairs a Live Photo's video to its still by shared base name
    // within one request, and every edited asset exposes "FullSizeRender.*",
    // so both part names are rebuilt from the original still's base name.
    let original = resources.first(where: { $0.type == .photo }) ?? photo
    let base = (original.originalFilename as NSString).deletingPathExtension

    FileManager.default.createFile(atPath: url.path, contents: nil)
    let handle = try FileHandle(forWritingTo: url)
    defer { try? handle.close() }

    if let directory, !directory.isEmpty {
      // The server's multipart parser reads `directory` while streaming, so
      // the field must precede every file part.
      write(handle, "--\(boundary)\r\nContent-Disposition: form-data; name=\"directory\"\r\n\r\n\(directory)\r\n")
    }
    let photoName = partFilename(base: base, resource: photo)
    try appendFilePart(handle, boundary: boundary, filename: photoName, resource: photo)
    if let video {
      try appendFilePart(
        handle,
        boundary: boundary,
        filename: partFilename(base: base, resource: video),
        resource: video
      )
    }
    write(handle, "--\(boundary)--\r\n")
    let bytes = (try? handle.offset()).map(Int64.init(clamping:)) ?? 0
    return UploadPreparedBody(name: photoName, bytes: bytes)
  }

  static func buildBody(
    forFiles files: [UploadStagedFile],
    directory: String?,
    boundary: String,
    to destinationURL: URL
  ) throws -> UploadPreparedBody {
    guard let firstFile = files.first else {
      throw UploadPrepareError.stagedAssetEmpty
    }
    FileManager.default.createFile(atPath: destinationURL.path, contents: nil)
    let destination = try FileHandle(forWritingTo: destinationURL)
    defer { try? destination.close() }

    if let directory, !directory.isEmpty {
      write(
        destination,
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"directory\"\r\n\r\n\(directory)\r\n"
      )
    }

    for file in files {
      try appendFilePart(destination, boundary: boundary, file: file)
    }
    write(destination, "--\(boundary)--\r\n")
    let bytes = (try? destination.offset()).map(Int64.init(clamping:)) ?? 0
    return UploadPreparedBody(name: safeFilename(firstFile.name), bytes: bytes)
  }

  private static func partFilename(base: String, resource: PHAssetResource) -> String {
    "\(base).\(resourceExtension(resource))"
  }

  private static func resourceExtension(_ resource: PHAssetResource) -> String {
    let originalExtension = (resource.originalFilename as NSString).pathExtension
    if !originalExtension.isEmpty {
      return originalExtension.lowercased()
    }
    if #available(iOS 26.0, *) {
      return resource.contentType.preferredFilenameExtension ?? "bin"
    }
    return UTType(resource.uniformTypeIdentifier)?.preferredFilenameExtension ?? "bin"
  }

  private static func mimeType(for resource: PHAssetResource) -> String {
    if #available(iOS 26.0, *) {
      return resource.contentType.preferredMIMEType ?? "application/octet-stream"
    }
    return UTType(resource.uniformTypeIdentifier)?.preferredMIMEType ?? "application/octet-stream"
  }

  private static func write(_ handle: FileHandle, _ text: String) {
    handle.write(Data(text.utf8))
  }

  private static func appendFilePart(
    _ handle: FileHandle,
    boundary: String,
    filename: String,
    resource: PHAssetResource
  ) throws {
    write(
      handle,
      "--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType(for: resource))\r\n\r\n"
    )
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true
    let semaphore = DispatchSemaphore(value: 0)
    var failure: Error?
    PHAssetResourceManager.default().requestData(for: resource, options: options) { chunk in
      handle.write(chunk)
    } completionHandler: { error in
      failure = error
      semaphore.signal()
    }
    semaphore.wait()
    if let failure {
      throw UploadPrepareError.resourceUnreadable(failure.localizedDescription)
    }
    write(handle, "\r\n")
  }

  private static func appendFilePart(
    _ handle: FileHandle,
    boundary: String,
    file: UploadStagedFile
  ) throws {
    let filename = safeFilename(file.name)
    let mimeType = safeMimeType(file.mimeType)
    write(
      handle,
      "--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n"
    )
    let source = try FileHandle(forReadingFrom: file.url)
    defer { try? source.close() }
    while let chunk = try source.read(upToCount: 1_048_576), !chunk.isEmpty {
      handle.write(chunk)
    }
    write(handle, "\r\n")
  }

  private static func safeFilename(_ filename: String) -> String {
    filename
      .replacingOccurrences(of: "\r", with: "_")
      .replacingOccurrences(of: "\n", with: "_")
      .replacingOccurrences(of: "\"", with: "_")
      .replacingOccurrences(of: "\\", with: "_")
  }

  private static func safeMimeType(_ mimeType: String) -> String {
    mimeType.range(
      of: "^[A-Za-z0-9][A-Za-z0-9!#$&^_.+\\-/]*$",
      options: .regularExpression
    ) == nil ? "application/octet-stream" : mimeType
  }
}
