import UIKit

extension PhotoDetailViewController {
  var ownsGallery: Bool {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
          let gallerySlug,
          session.activeWorkspace?.slug == gallerySlug
    else { return false }
    return true
  }

  func ownerActionMenuElements(photoId: String, index: Int) -> [UIMenuElement] {
    [
      UIAction(
        title: String(localized: "Edit tags"),
        image: UIImage(systemName: "tag")
      ) { [weak self] _ in
        self?.editTags(index: index)
      },
      UIAction(
        title: String(localized: "Delete"),
        image: UIImage(systemName: "trash"),
        attributes: .destructive
      ) { [weak self] _ in
        self?.confirmDelete(photoId: photoId)
      },
    ]
  }

  private func editTags(index: Int) {
    guard photos.indices.contains(index),
          let assetId = resolveAssetId(photoId: photos[index].id)
    else { return }
    let alert = UIAlertController(
      title: String(localized: "Edit tags"),
      message: String(localized: "Enter comma-separated tags. The result replaces tags on this photo."),
      preferredStyle: .alert
    )
    alert.addTextField { [tags = photos[index].tags] field in
      field.text = tags.joined(separator: ", ")
    }
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    alert.addAction(UIAlertAction(title: String(localized: "Save"), style: .default) { [weak self, weak alert] _ in
      let tags = StudioPhotoMutations.parseTags(alert?.textFields?.first?.text ?? "")
      self?.applyTags(tags, assetId: assetId)
    })
    present(alert, animated: true)
  }

  private func applyTags(_ tags: [String], assetId: String) {
    Task { @MainActor [weak self] in
      do {
        try await StudioPhotoMutations.applyTags(tags, assetIds: [assetId]) { change in
          PhotoFeedStore.shared.applyCommitted(change)
        }
        self?.resync()
        self?.showConfirmation(String(localized: "Tags updated"))
      } catch {
        self?.showAlert(
          title: String(localized: "Unable to update tags"),
          message: error.localizedDescription
        )
      }
    }
  }

  private func confirmDelete(photoId: String) {
    guard let gallerySlug, let assetId = resolveAssetId(photoId: photoId) else { return }
    let provider = (try? PhotoReplicaRepository().storageProvider(
      forAssetId: assetId,
      slug: gallerySlug
    )) ?? nil
    let requiresStorageDeletion = StudioLibraryDeletePolicy.requiresStorageDeletion(
      storageProviders: [provider].compactMap { $0 }
    )
    let alert = UIAlertController(
      title: String(localized: "Delete this photo?"),
      message: String(localized: "Removing storage files cannot be undone."),
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    if requiresStorageDeletion {
      alert.addAction(UIAlertAction(
        title: String(localized: "Delete"),
        style: .destructive
      ) { [weak self] _ in self?.delete(assetId: assetId, fromStorage: true) })
    } else {
      alert.addAction(UIAlertAction(
        title: String(localized: "Remove record only"),
        style: .destructive
      ) { [weak self] _ in self?.delete(assetId: assetId, fromStorage: false) })
      alert.addAction(UIAlertAction(
        title: String(localized: "Delete files too"),
        style: .destructive
      ) { [weak self] _ in self?.delete(assetId: assetId, fromStorage: true) })
    }
    present(alert, animated: true)
  }

  private func delete(assetId: String, fromStorage: Bool) {
    Task { @MainActor [weak self] in
      do {
        let changes = try await StudioPhotoMutations.delete(
          assetIds: [assetId],
          fromStorage: fromStorage
        )
        self?.commit(changes)
        self?.dismiss(animated: true)
      } catch {
        self?.showAlert(
          title: String(localized: "Unable to delete photo"),
          message: error.localizedDescription
        )
      }
    }
  }

  private func commit(_ changes: [PhotoChange]) {
    for change in changes {
      PhotoFeedStore.shared.applyCommitted(change)
    }
    resync()
  }

  private func resync() {
    guard let gallerySlug else { return }
    PhotoSyncEngine.shared.ensureSynced(slug: gallerySlug, includeStudio: true)
  }

  private func resolveAssetId(photoId: String) -> String? {
    guard let gallerySlug else { return nil }
    if let assetId = try? PhotoReplicaRepository().assetId(forPhotoId: photoId, slug: gallerySlug) {
      return assetId
    }
    PhotoSyncEngine.shared.ensureSynced(slug: gallerySlug, includeStudio: true)
    showAlert(
      title: String(localized: "Still syncing"),
      message: String(localized: "Still syncing, try again")
    )
    return nil
  }

  private func showConfirmation(_ message: String) {
    UIAccessibility.post(notification: .announcement, argument: message)
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    present(alert, animated: true)
    Task { @MainActor [weak alert] in
      try? await Task.sleep(for: .seconds(1.2))
      alert?.dismiss(animated: true)
    }
  }

  private func showAlert(title: String, message: String) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }
}
