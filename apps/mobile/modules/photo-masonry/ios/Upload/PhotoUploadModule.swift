import Photos
import PhotosUI
import UIKit

enum UploadPickError: LocalizedError {
  case accessDenied
  case limitedSelection(Int)

  var errorDescription: String? {
    switch self {
    case .accessDenied:
      return "Photo library access is required to upload photos."
    case .limitedSelection(let count):
      return "\(count) selected item(s) are outside this app's limited photo access. Allow full access in Settings to upload them."
    }
  }
}

struct UploadPickedPhoto: Equatable, Sendable {
  let id: String
  let isLivePhoto: Bool
  let name: String
}

@MainActor
final class UploadPickerSession: NSObject, PHPickerViewControllerDelegate {
  private static var active: UploadPickerSession?
  private let completion: @MainActor @Sendable (Result<[UploadPickedPhoto], UploadPickError>) -> Void

  private init(
    completion: @escaping @MainActor @Sendable (Result<[UploadPickedPhoto], UploadPickError>) -> Void
  ) {
    self.completion = completion
  }

  static func present(
    from presenter: UIViewController,
    completion: @escaping @MainActor @Sendable (Result<[UploadPickedPhoto], UploadPickError>) -> Void
  ) {
    Task { @MainActor in
      let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
      guard status == .authorized || status == .limited else {
        completion(.failure(.accessDenied))
        return
      }
      var configuration = PHPickerConfiguration(photoLibrary: .shared())
      configuration.filter = .any(of: [.images, .livePhotos])
      configuration.selectionLimit = 0
      configuration.selection = .ordered
      configuration.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: configuration)
      let session = UploadPickerSession(completion: completion)
      picker.delegate = session
      active = session
      presenter.present(picker, animated: true)
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    Self.active = nil
    let identifiers = results.compactMap(\.assetIdentifier)
    guard !identifiers.isEmpty else {
      completion(.success([]))
      return
    }
    Task {
      let result: Result<[UploadPickedPhoto], UploadPickError> = await Task.detached(
        priority: .userInitiated
      ) {
        var assetsById: [String: PHAsset] = [:]
        PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
          .enumerateObjects { asset, _, _ in
            assetsById[asset.localIdentifier] = asset
          }
        var items: [UploadPickedPhoto] = []
        var missing = 0
        for identifier in identifiers {
          guard let asset = assetsById[identifier] else {
            missing += 1
            continue
          }
          let resources = PHAssetResource.assetResources(for: asset)
          let original = resources.first { $0.type == .photo } ?? resources.first
          items.append(
            UploadPickedPhoto(
              id: identifier,
              isLivePhoto: asset.mediaSubtypes.contains(.photoLive),
              name: original?.originalFilename ?? "Photo"
            )
          )
        }
        if missing > 0 {
          return .failure(.limitedSelection(missing))
        }
        return .success(items)
      }.value
      completion(result)
    }
  }
}
