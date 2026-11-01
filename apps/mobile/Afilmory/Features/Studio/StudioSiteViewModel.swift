import SwiftUI

@MainActor
final class StudioSiteViewModel: ObservableObject {
  @Published private(set) var data: StudioSiteSchemaResponse?
  @Published var draft: [String: String] = [:]
  @Published private(set) var baseline: [String: String] = [:]
  @Published private(set) var loading = false
  @Published private(set) var saving = false
  @Published var error: Error?
  @Published var saveError: Error?
  @Published var saved = false

  var changedEntries: [StudioSiteSettingsUpdateBody.Entry] {
    draft.keys.sorted().compactMap { key in
      guard draft[key] != baseline[key] else { return nil }
      return .init(key: key, value: draft[key] ?? "")
    }
  }

  func load() async {
    guard changedEntries.isEmpty else { return }
    if data == nil { loading = true }
    defer { loading = false }
    do {
      let response = try await NativeStudioAPI.siteSettings()
      data = response
      let next = Self.makeDraft(response)
      baseline = next
      draft = next
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }

  func save() async {
    let entries = changedEntries
    guard !saving, !entries.isEmpty else { return }
    saving = true
    defer { saving = false }
    do {
      try await NativeStudioAPI.updateSiteSettings(entries)
      baseline = draft
      saved = true
    } catch {
      saveError = error
    }
  }

  private static func makeDraft(_ response: StudioSiteSchemaResponse) -> [String: String] {
    var result: [String: String] = [:]
    for section in response.schema.sections {
      for field in collectFields(section.children ?? []) {
        guard let key = field.key else { continue }
        result[key] = response.values[key] ?? ""
      }
    }
    return result
  }

  static func collectFields(_ nodes: [StudioSiteSchemaResponse.Node]) -> [StudioSiteSchemaResponse.Node] {
    nodes.flatMap { node in
      if node.type == "field" { return node.hidden == true ? [] : [node] }
      return collectFields(node.children ?? [])
    }
  }
}
