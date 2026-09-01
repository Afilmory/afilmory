import Photos
import UIKit

enum PhotoLibrarySaveError: LocalizedError {
  case authorizationDenied
  case invalidSource

  var errorDescription: String? {
    switch self {
    case .authorizationDenied:
      String(localized: "Afilmory needs permission to add photos to your library.")
    case .invalidSource:
      String(localized: "This photo has no downloadable original.")
    }
  }
}

enum PhotoLibrarySaver {
  static func save(originalUrl: String, livePhotoVideoUrl: String?) async throws {
    guard let imageSource = URL(string: originalUrl) else {
      throw PhotoLibrarySaveError.invalidSource
    }
    let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard status == .authorized || status == .limited else {
      throw PhotoLibrarySaveError.authorizationDenied
    }

    let imageFile = try await download(imageSource, fallbackExtension: "jpg")
    defer { try? FileManager.default.removeItem(at: imageFile) }

    var videoFile: URL?
    if let livePhotoVideoUrl, let videoSource = URL(string: livePhotoVideoUrl) {
      videoFile = try? await download(videoSource, fallbackExtension: "mov")
    }
    defer {
      if let videoFile {
        try? FileManager.default.removeItem(at: videoFile)
      }
    }

    do {
      try await write(image: imageFile, pairedVideo: videoFile)
    } catch {
      guard videoFile != nil else { throw error }
      try await write(image: imageFile, pairedVideo: nil)
    }
  }

  private static func write(image: URL, pairedVideo: URL?) async throws {
    try await PHPhotoLibrary.shared().performChanges {
      let request = PHAssetCreationRequest.forAsset()
      request.addResource(with: .photo, fileURL: image, options: nil)
      if let pairedVideo {
        request.addResource(with: .pairedVideo, fileURL: pairedVideo, options: nil)
      }
    }
  }

  private static func download(_ url: URL, fallbackExtension: String) async throws -> URL {
    let (temporary, response) = try await URLSession.shared.download(from: url)
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
      try? FileManager.default.removeItem(at: temporary)
      throw URLError(.badServerResponse)
    }
    let pathExtension = url.pathExtension.isEmpty ? fallbackExtension : url.pathExtension
    let destination = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension(pathExtension)
    try FileManager.default.moveItem(at: temporary, to: destination)
    return destination
  }
}
