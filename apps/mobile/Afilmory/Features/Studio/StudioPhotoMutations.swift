import Foundation

private struct StudioTagsBody: Encodable {
  let tags: [String]
}

private struct StudioDeleteBody: Encodable {
  let deleteFromStorage: Bool
  let ids: [String]
}

private struct StudioTagResponse: Decodable {
  let change: PhotoChange?
}

private struct StudioDeleteResponse: Decodable {
  let changes: [PhotoChange]?
}

enum StudioPhotoMutations {
  static func tagsEndpoint(assetId: String, tags: [String]) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .tenant,
      path: "photos/assets/\(assetId)/tags",
      method: .patch,
      body: try APIEndpoint.jsonBody(StudioTagsBody(tags: tags))
    )
  }

  static func deleteEndpoint(assetIds: [String], fromStorage: Bool) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .tenant,
      path: "photos/assets",
      method: .delete,
      body: try APIEndpoint.jsonBody(
        StudioDeleteBody(deleteFromStorage: fromStorage, ids: assetIds)
      )
    )
  }

  static func applyTags(_ tags: [String], assetIds: [String]) async throws -> [PhotoChange] {
    var changes: [PhotoChange] = []
    for id in assetIds {
      let response: StudioTagResponse = try await AfilmoryAPI.shared.request(
        try tagsEndpoint(assetId: id, tags: tags)
      )
      if let change = response.change {
        changes.append(change)
      }
    }
    return changes
  }

  static func delete(assetIds: [String], fromStorage: Bool) async throws -> [PhotoChange] {
    let response: StudioDeleteResponse = try await AfilmoryAPI.shared.request(
      try deleteEndpoint(assetIds: assetIds, fromStorage: fromStorage)
    )
    return response.changes ?? []
  }

  static func parseTags(_ value: String) -> [String] {
    var seen = Set<String>()
    return value.split(separator: ",").compactMap { part in
      let tag = part.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !tag.isEmpty, seen.insert(tag).inserted else { return nil }
      return tag
    }.prefix(32).map { $0 }
  }
}
