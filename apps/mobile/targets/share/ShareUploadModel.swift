import Combine
import Foundation
import UniformTypeIdentifiers

@MainActor
final class ShareUploadModel: ObservableObject {
  @Published private(set) var phase: ShareUploadPhase = .idle
  @Published private(set) var items: [ShareUploadBatchItem] = []
  @Published private(set) var previewURLs: [String: URL] = [:]
  @Published private(set) var context: ShareUploadContextSnapshot?
  @Published private(set) var loadedCount = 0
  @Published private(set) var totalCount = 0
  @Published private(set) var isSubmitting = false
  @Published var tags: [String] = []
  @Published var draft = ""
  @Published var errorMessage: String?


  private let onCancel: () -> Void
  private let onComplete: () -> Void
  private var store: ShareUploadBatchStore?
  private var receiptTask: Task<Void, Never>?
  private var submissionStartedAt: Date?

  init(onCancel: @escaping () -> Void, onComplete: @escaping () -> Void) {
    self.onCancel = onCancel
    self.onComplete = onComplete
  }

  deinit {
    receiptTask?.cancel()
  }

  var batchID: String {
    store?.batchID ?? ""
  }

  var suggestedTags: [String] {
    guard let context else { return [] }
    return context.suggestedTags.filter { !submissionTags.contains($0) }
  }

  var submissionTags: [String] {
    var seen = Set<String>()
    let values = tags + Self.parseTags(draft)
    return values.compactMap { value in
      let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard !normalized.isEmpty, seen.insert(normalized).inserted else { return nil }
      return normalized
    }.prefix(32).map { $0 }
  }

  var serializedTags: String {
    submissionTags.joined(separator: ",")
  }

  var handoffURL: URL {
    var components = URLComponents()
    components.scheme = "afilmory"
    components.path = "/share-upload"
    components.queryItems = [
      URLQueryItem(name: "batchID", value: batchID),
      URLQueryItem(name: "tags", value: serializedTags),
    ]
    guard let url = components.url else {
      preconditionFailure("The Share Upload handoff URL must be valid.")
    }
    return url
  }

  func load(inputItems: [NSExtensionItem]) {
    guard phase == .idle else { return }
    guard let context = ShareUploadBatchStore.loadContext() else {
      phase = .unavailable
      return
    }
    self.context = context

    let providers = inputItems
      .compactMap(\.attachments)
      .flatMap { $0 }
      .filter { provider in
        provider.registeredTypeIdentifiers.contains { identifier in
          UTType(identifier)?.conforms(to: .image) == true
        }
      }
      .prefix(20)
    guard !providers.isEmpty else {
      phase = .failed
      errorMessage = ShareUploadError.noImages.localizedDescription
      return
    }

    phase = .loading
    totalCount = providers.count
    ShareUploadBatchStore.cleanupStaleContent()
    Task {
      do {
        let store = try ShareUploadBatchStore(workspaceID: context.workspaceID)
        self.store = store
        for provider in providers {
          try Task.checkCancellation()
          let item = try await store.stage(ShareItemProvider(value: provider))
          items.append(item)
          if let previewURL = await store.previewURL(for: item) {
            previewURLs[item.id] = previewURL
          }
          loadedCount += 1
        }
        phase = .ready
        observeReceipt(using: store)
      } catch is CancellationError {
        return
      } catch {
        phase = .failed
        errorMessage = error.localizedDescription
      }
    }
  }

  func remove(_ item: ShareUploadBatchItem) {
    guard !isSubmitting, let store else { return }
    Task {
      do {
        try await store.remove(itemID: item.id)
        items.removeAll { $0.id == item.id }
        previewURLs.removeValue(forKey: item.id)
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  func toggleTag(_ tag: String) {
    guard !isSubmitting else { return }
    if let index = tags.firstIndex(of: tag) {
      tags.remove(at: index)
    } else {
      tags.append(tag)
    }
  }

  func commitDraft() {
    guard !isSubmitting else { return }
    for value in Self.parseTags(draft) where !tags.contains(value) {
      tags.append(value)
    }
    draft = ""
  }

  func beginSubmitting() {
    guard phase == .ready, !items.isEmpty else { return }
    isSubmitting = true
    submissionStartedAt = .now
    errorMessage = nil
  }

  func cancel() {
    receiptTask?.cancel()
    if isSubmitting {
      // The main app may already be copying the staged files. Leave the batch
      // in place for that process (or the stale-content cleanup) to own.
      onCancel()
      return
    }
    if let store {
      Task {
        await store.cleanup()
        onCancel()
      }
    } else {
      onCancel()
    }
  }

  private func observeReceipt(using store: ShareUploadBatchStore) {
    receiptTask?.cancel()
    receiptTask = Task {
      while !Task.isCancelled {
        if let receipt = await store.readReceipt() {
          await store.removeReceipt()
          if receipt.status == "accepted" {
            onComplete()
            return
          }
          isSubmitting = false
          submissionStartedAt = nil
          errorMessage = receipt.message ?? String(localized: "Upload could not start")
        }
        if isSubmitting,
           let submissionStartedAt,
           Date.now.timeIntervalSince(submissionStartedAt) >= 120 {
          isSubmitting = false
          self.submissionStartedAt = nil
          errorMessage = String(localized: "Afilmory did not confirm the upload queue. Please try again.")
        }
        try? await Task.sleep(for: .milliseconds(200))
      }
    }
  }

  private static func parseTags(_ value: String) -> [String] {
    value.split(separator: ",").compactMap { part in
      let normalized = part.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return normalized.isEmpty ? nil : normalized
    }
  }
}
