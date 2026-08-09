import Foundation

enum ShareUploadHandoff {
  struct Parameters: Equatable {
    let batchID: String
    let tags: String
  }

  static func parameters(
    from url: URL,
    scheme: String = AfilmoryBuildConfiguration.urlScheme
  ) -> Parameters? {
    guard url.scheme?.lowercased() == scheme.lowercased(),
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          components.host?.lowercased() == "share-upload" || components.path == "/share-upload",
          let batchID = components.queryItems?.first(where: { $0.name == "batchID" })?.value,
          UUID(uuidString: batchID) != nil
    else { return nil }
    let tags = components.queryItems?.first(where: { $0.name == "tags" })?.value ?? ""
    return Parameters(batchID: batchID, tags: tags)
  }

  static func handle(_ url: URL) -> Bool {
    guard let parameters = parameters(from: url) else { return false }
    Task {
      try? await ShareUploadIntentBridge.start(
        batchID: parameters.batchID,
        tags: parameters.tags
      )
    }
    return true
  }
}
