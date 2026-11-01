import Foundation
import GRDB

enum PhotoReplicaDatabase {
  static let shared = FixtureMode.isOn ? makeInMemory() : PhotoReplicaStore(queue: makeQueue(at: storeURL()))

  static func makeInMemory() -> PhotoReplicaStore {
    PhotoReplicaStore(queue: try! DatabaseQueue())
  }

  static func storeURL(
    in directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  ) -> URL {
    let folder = directory.appending(path: "AfilmoryReplica", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder.appending(path: "PhotoReplica.sqlite")
  }

  private static func makeQueue(at url: URL) -> DatabaseQueue {
    var configuration = Configuration()
    configuration.foreignKeysEnabled = true
    do {
      return try DatabaseQueue(path: url.path, configuration: configuration)
    } catch {
      NSLog("[PhotoReplica] Store failed to open, recreating: %@", url.path)
      removeStoreFiles(at: url)
      do {
        return try DatabaseQueue(path: url.path, configuration: configuration)
      } catch {
        NSLog("[PhotoReplica] Falling back to in-memory replica: %@", error.localizedDescription)
        return try! DatabaseQueue()
      }
    }
  }

  private static func removeStoreFiles(at url: URL) {
    let fileManager = FileManager.default
    for suffix in ["", "-wal", "-shm"] {
      try? fileManager.removeItem(atPath: url.path + suffix)
    }
  }
}

final class PhotoReplicaStore: Sendable {
  let queue: DatabaseQueue

  init(queue: DatabaseQueue) {
    self.queue = queue
    try? PhotoReplicaMigrations.makeMigrator().migrate(queue)
  }

  func wipeAll() throws {
    try queue.write { db in
      try db.execute(sql: "DELETE FROM photos")
      try db.execute(sql: "DELETE FROM studio_assets")
      try db.execute(sql: "DELETE FROM replica_state")
    }
  }

  func wipeTenant(_ slug: String) throws {
    try queue.write { db in
      try db.execute(sql: "DELETE FROM photos WHERE tenant_slug = ?", arguments: [slug])
      try db.execute(sql: "DELETE FROM studio_assets WHERE tenant_slug = ?", arguments: [slug])
      try db.execute(sql: "DELETE FROM replica_state WHERE tenant_slug = ?", arguments: [slug])
    }
  }

}
