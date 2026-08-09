import Foundation
import ImageIO
import Photos
import UniformTypeIdentifiers

struct ShareItemProvider: @unchecked Sendable {
  let value: NSItemProvider
}

actor ShareUploadBatchStore {
  static let appGroupIdentifier = "group.app.afilmory"
  static let contextKey = "share-upload.context.v1"
  static let inboxDirectory = "share-upload/inbox"
  static let receiptDirectory = "share-upload/receipts"

  nonisolated let batchID: String
  private let workspaceID: String
  private let containerURL: URL
  private let batchURL: URL
  private var items: [ShareUploadBatchItem] = []

  init(workspaceID: String) throws {
    guard let containerURL = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier
    ) else { throw ShareUploadError.missingContainer }
    let batchID = UUID().uuidString
    self.batchID = batchID
    self.workspaceID = workspaceID
    self.containerURL = containerURL
    self.batchURL = containerURL
      .appendingPathComponent(Self.inboxDirectory, isDirectory: true)
      .appendingPathComponent(batchID, isDirectory: true)
    try FileManager.default.createDirectory(
      at: batchURL.appendingPathComponent("files", isDirectory: true),
      withIntermediateDirectories: true
    )
    try FileManager.default.createDirectory(
      at: batchURL.appendingPathComponent("previews", isDirectory: true),
      withIntermediateDirectories: true
    )
    let manifest = ShareUploadBatchManifest(
      id: batchID,
      workspaceID: workspaceID,
      createdAt: .now,
      items: []
    )
    let data = try JSONEncoder().encode(manifest)
    try data.write(to: batchURL.appendingPathComponent("manifest.json"), options: .atomic)
  }

  static func loadContext() -> ShareUploadContextSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
          let data = defaults.data(forKey: contextKey)
    else { return nil }
    return try? JSONDecoder().decode(ShareUploadContextSnapshot.self, from: data)
  }

  static func cleanupStaleContent() {
    guard let containerURL = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else { return }
    let cutoff = Date.now.addingTimeInterval(-86_400)
    for relativeDirectory in [inboxDirectory, receiptDirectory] {
      let directory = containerURL.appendingPathComponent(relativeDirectory, isDirectory: true)
      guard let children = try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: [.contentModificationDateKey],
        options: [.skipsHiddenFiles]
      ) else { continue }
      for child in children {
        let values = try? child.resourceValues(forKeys: [.contentModificationDateKey])
        if values?.contentModificationDate.map({ $0 < cutoff }) ?? false {
          try? FileManager.default.removeItem(at: child)
        }
      }
    }
  }

  func stage(_ input: ShareItemProvider) async throws -> ShareUploadBatchItem {
    let provider = input.value
    if provider.canLoadObject(ofClass: PHLivePhoto.self)
      || provider.hasItemConformingToTypeIdentifier(UTType.livePhoto.identifier) {
      return try await stageLivePhoto(provider)
    }

    return try await stagePhoto(provider)
  }

  private func stagePhoto(_ provider: NSItemProvider) async throws -> ShareUploadBatchItem {
    guard let type = preferredImageType(for: provider) else {
      throw ShareUploadError.unreadableImage
    }
    let itemID = UUID().uuidString
    let extensionName = type.preferredFilenameExtension ?? "img"
    let sourceName = normalizedFilename(
      provider.suggestedName,
      fallback: "Photo-\(items.count + 1)",
      extensionName: extensionName
    )
    let relativePath = "files/\(itemID)-photo.\(extensionName)"
    let destinationURL = batchURL.appendingPathComponent(relativePath)

    try await copyRepresentation(
      provider: provider,
      typeIdentifier: type.identifier,
      destinationURL: destinationURL
    )

    let previewRelativePath = "previews/\(itemID).jpg"
    let previewURL = batchURL.appendingPathComponent(previewRelativePath)
    ShareThumbnailGenerator.write(sourceURL: destinationURL, destinationURL: previewURL)
    let bytes = ((try? destinationURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
    let resource = ShareUploadBatchResource(
      role: .photo,
      relativePath: relativePath,
      name: sourceName,
      mimeType: type.preferredMIMEType ?? "application/octet-stream",
      bytes: Int64(bytes)
    )
    let item = ShareUploadBatchItem(
      id: itemID,
      previewRelativePath: FileManager.default.fileExists(atPath: previewURL.path) ? previewRelativePath : nil,
      resources: [resource]
    )
    items.append(item)
    try writeManifest()
    return item
  }

  private func stageLivePhoto(_ provider: NSItemProvider) async throws -> ShareUploadBatchItem {
    let resources: [PHAssetResource]
    if provider.canLoadObject(ofClass: PHLivePhoto.self) {
      let livePhoto = try await loadLivePhoto(from: provider)
      resources = PHAssetResource.assetResources(for: livePhoto)
    } else {
      resources = try await resolveLivePhotoResources(from: provider)
    }
    return try await stageLivePhoto(resources: resources)
  }

  private func stageLivePhoto(resources: [PHAssetResource]) async throws -> ShareUploadBatchItem {
    guard let photo = resources.first(where: {
      $0.type == .photo && resourceExtension($0) == "heic"
    }) ?? resources.first(where: {
      $0.type == .fullSizePhoto && resourceExtension($0) == "heic"
    }),
    let pairedVideo = resources.first(where: {
      $0.type == .pairedVideo && resourceExtension($0) == "mov"
    }) ?? resources.first(where: {
      $0.type == .fullSizePairedVideo && resourceExtension($0) == "mov"
    })
    else {
      throw ShareUploadError.unsupportedLivePhotoResources
    }

    let original = resources.first(where: { $0.type == .photo }) ?? photo
    let fallback = "Photo-\(items.count + 1)"
    let baseName = normalizedBaseName(original.originalFilename, fallback: fallback)
    let itemID = UUID().uuidString
    let photoResource = try await stage(
      resource: photo,
      role: .photo,
      baseName: baseName,
      itemID: itemID
    )
    let videoResource = try await stage(
      resource: pairedVideo,
      role: .pairedVideo,
      baseName: baseName,
      itemID: itemID
    )

    let previewRelativePath = "previews/\(itemID).jpg"
    let photoURL = batchURL.appendingPathComponent(photoResource.relativePath)
    let previewURL = batchURL.appendingPathComponent(previewRelativePath)
    ShareThumbnailGenerator.write(sourceURL: photoURL, destinationURL: previewURL)
    let item = ShareUploadBatchItem(
      id: itemID,
      previewRelativePath: FileManager.default.fileExists(atPath: previewURL.path) ? previewRelativePath : nil,
      resources: [photoResource, videoResource]
    )
    items.append(item)
    try writeManifest()
    return item
  }

  func remove(itemID: String) throws {
    guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
    let item = items.remove(at: index)
    for resource in item.resources {
      try? FileManager.default.removeItem(at: batchURL.appendingPathComponent(resource.relativePath))
    }
    if let previewRelativePath = item.previewRelativePath {
      try? FileManager.default.removeItem(at: batchURL.appendingPathComponent(previewRelativePath))
    }
    try writeManifest()
  }

  func previewURL(for item: ShareUploadBatchItem) -> URL? {
    guard let previewRelativePath = item.previewRelativePath else { return nil }
    return batchURL.appendingPathComponent(previewRelativePath)
  }

  func readReceipt() -> ShareUploadReceipt? {
    let url = containerURL
      .appendingPathComponent(Self.receiptDirectory, isDirectory: true)
      .appendingPathComponent("\(batchID).json")
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(ShareUploadReceipt.self, from: data)
  }

  func removeReceipt() {
    let url = containerURL
      .appendingPathComponent(Self.receiptDirectory, isDirectory: true)
      .appendingPathComponent("\(batchID).json")
    try? FileManager.default.removeItem(at: url)
  }

  func cleanup() {
    try? FileManager.default.removeItem(at: batchURL)
    removeReceipt()
  }

  private func preferredImageType(for provider: NSItemProvider) -> UTType? {
    let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
    return types.first { $0 == .heic }
      ?? types.first {
      $0.conforms(to: .image) && $0 != .image && $0 != .livePhoto && $0.preferredFilenameExtension != nil
    }
      ?? types.first { $0.conforms(to: .image) }
  }

  private func normalizedBaseName(_ sourceName: String?, fallback: String) -> String {
    let raw = sourceName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let filename = (raw?.isEmpty == false ? raw : nil) ?? fallback
    let base = (filename as NSString).deletingPathExtension
      .replacingOccurrences(of: "/", with: "-")
      .replacingOccurrences(of: "\\", with: "-")
    return base.isEmpty ? fallback : base
  }

  private func normalizedFilename(
    _ suggestedName: String?,
    fallback: String,
    extensionName: String
  ) -> String {
    let raw = suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let base = ((raw?.isEmpty == false ? raw : nil) ?? fallback)
      .replacingOccurrences(of: "/", with: "-")
      .replacingOccurrences(of: "\\", with: "-")
    return (base as NSString).pathExtension.isEmpty ? "\(base).\(extensionName)" : base
  }

  private func copyRepresentation(
    provider: NSItemProvider,
    typeIdentifier: String,
    destinationURL: URL
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { sourceURL, error in
        do {
          if let error { throw error }
          guard let sourceURL else { throw ShareUploadError.unreadableImage }
          try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func loadLivePhoto(from provider: NSItemProvider) async throws -> PHLivePhoto {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadObject(ofClass: PHLivePhoto.self) { object, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let livePhoto = object as? PHLivePhoto {
          continuation.resume(returning: livePhoto)
        } else {
          continuation.resume(throwing: ShareUploadError.incompleteLivePhoto)
        }
      }
    }
  }

  private func resolveLivePhotoResources(from provider: NSItemProvider) async throws -> [PHAssetResource] {
    guard let type = preferredLivePhotoLookupType(for: provider) else {
      throw ShareUploadError.unreadableImage
    }
    let lookupURL = batchURL.appendingPathComponent(
      ".live-photo-lookup-\(UUID().uuidString).\(type.preferredFilenameExtension ?? "img")"
    )
    defer { try? FileManager.default.removeItem(at: lookupURL) }
    try await copyRepresentation(
      provider: provider,
      typeIdentifier: type.identifier,
      destinationURL: lookupURL
    )
    guard let signature = livePhotoSignature(at: lookupURL) else {
      throw ShareUploadError.livePhotoNotFound
    }

    let authorization = await photoLibraryAuthorizationStatus()
    guard authorization == .authorized || authorization == .limited else {
      throw ShareUploadError.photoLibraryAccessDenied
    }

    let fetchResult = PHAsset.fetchAssets(with: .image, options: nil)
    var preferredAssets: [PHAsset] = []
    var remainingAssets: [PHAsset] = []
    for index in 0..<fetchResult.count {
      let asset = fetchResult.object(at: index)
      guard asset.mediaSubtypes.contains(.photoLive) else { continue }
      let exactDimensions = asset.pixelWidth == signature.width && asset.pixelHeight == signature.height
      let rotatedDimensions = asset.pixelWidth == signature.height && asset.pixelHeight == signature.width
      if exactDimensions || rotatedDimensions {
        preferredAssets.append(asset)
      } else {
        remainingAssets.append(asset)
      }
    }

    for asset in preferredAssets + remainingAssets {
      let resources = PHAssetResource.assetResources(for: asset)
      let stills = resources.filter { $0.type == .photo || $0.type == .fullSizePhoto }
      for still in stills {
        guard let identifier = try await contentIdentifier(for: still) else { continue }
        if identifier.caseInsensitiveCompare(signature.contentIdentifier) == .orderedSame {
          return resources
        }
      }
    }

    if authorization == .limited {
      throw ShareUploadError.photoLibraryAccessDenied
    }
    throw ShareUploadError.livePhotoNotFound
  }

  private func preferredLivePhotoLookupType(for provider: NSItemProvider) -> UTType? {
    let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
    return types.first { $0 == .heic }
      ?? types.first {
        $0.conforms(to: .image) && $0 != .image && $0 != .livePhoto
      }
  }

  private func photoLibraryAuthorizationStatus() async -> PHAuthorizationStatus {
    let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard current == .notDetermined else { return current }
    return await withCheckedContinuation { continuation in
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        continuation.resume(returning: status)
      }
    }
  }

  private func livePhotoSignature(at url: URL) -> (contentIdentifier: String, width: Int, height: Int)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let makerApple = properties[kCGImagePropertyMakerAppleDictionary] as? [String: Any],
          let identifier = makerApple["17"] as? String,
          !identifier.isEmpty,
          let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let height = properties[kCGImagePropertyPixelHeight] as? NSNumber
    else { return nil }
    return (identifier, width.intValue, height.intValue)
  }

  private func contentIdentifier(for resource: PHAssetResource) async throws -> String? {
    let url = batchURL.appendingPathComponent(
      ".live-photo-candidate-\(UUID().uuidString).\(resourceExtension(resource))"
    )
    defer { try? FileManager.default.removeItem(at: url) }
    try await write(resource: resource, to: url)
    return livePhotoSignature(at: url)?.contentIdentifier
  }

  private func stage(
    resource: PHAssetResource,
    role: ShareUploadResourceRole,
    baseName: String,
    itemID: String
  ) async throws -> ShareUploadBatchResource {
    let extensionName = resourceExtension(resource)
    let suffix = role == .photo ? "photo" : "video"
    let relativePath = "files/\(itemID)-\(suffix).\(extensionName)"
    let destinationURL = batchURL.appendingPathComponent(relativePath)
    try await write(resource: resource, to: destinationURL)
    let bytes = (try? destinationURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    return ShareUploadBatchResource(
      role: role,
      relativePath: relativePath,
      name: "\(baseName).\(extensionName)",
      mimeType: resourceType(resource)?.preferredMIMEType ?? "application/octet-stream",
      bytes: Int64(bytes)
    )
  }

  private func resourceExtension(_ resource: PHAssetResource) -> String {
    let originalExtension = (resource.originalFilename as NSString).pathExtension
    if !originalExtension.isEmpty {
      return originalExtension.lowercased()
    }
    return resourceType(resource)?.preferredFilenameExtension ?? "bin"
  }

  private func resourceType(_ resource: PHAssetResource) -> UTType? {
    if #available(iOS 26.0, *) {
      return resource.contentType
    }
    return UTType(resource.uniformTypeIdentifier)
  }

  private func write(resource: PHAssetResource, to destinationURL: URL) async throws {
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().writeData(
        for: resource,
        toFile: destinationURL,
        options: options
      ) { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume()
        }
      }
    }
  }

  private func writeManifest() throws {
    let manifest = ShareUploadBatchManifest(
      id: batchID,
      workspaceID: workspaceID,
      createdAt: .now,
      items: items
    )
    let data = try JSONEncoder().encode(manifest)
    try data.write(to: batchURL.appendingPathComponent("manifest.json"), options: .atomic)
  }
}
