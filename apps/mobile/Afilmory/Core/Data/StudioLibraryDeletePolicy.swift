import Foundation

enum StudioLibraryDeletePolicy {
  static func requiresStorageDeletion(storageProviders: [String]) -> Bool {
    storageProviders.contains { provider in
      provider.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "managed"
    }
  }
}

