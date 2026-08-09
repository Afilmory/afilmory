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

struct StudioSiteView: View {
  @StateObject private var model = StudioSiteViewModel()

  var body: some View {
    Group {
      if model.loading, model.data == nil {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let error = model.error, model.data == nil {
        StudioFailureView(error: error) { Task { await model.load() } }
      } else if let data = model.data {
        siteForm(data)
      }
    }
    .task { await model.load() }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(model.saving ? String(localized: "Saving…") : String(localized: "Save")) {
          Task { await model.save() }
        }
        .disabled(model.saving || model.changedEntries.isEmpty)
        .fontWeight(.semibold)
      }
    }
    .alert(String(localized: "Settings saved"), isPresented: $model.saved) {
      Button(String(localized: "Done")) { model.saved = false }
    } message: {
      Text("Your public gallery settings have been updated.")
    }
    .alert(
      String(localized: "Unable to save site settings"),
      isPresented: Binding(
        get: { model.saveError != nil },
        set: { if !$0 { model.saveError = nil } }
      )
    ) {
      Button(String(localized: "Done")) { model.saveError = nil }
    } message: {
      Text(model.saveError?.localizedDescription ?? "")
    }
  }

  private func siteForm(_ data: StudioSiteSchemaResponse) -> some View {
    Form {
      ForEach(data.schema.sections) { section in
        Section {
          ForEach(StudioSiteViewModel.collectFields(section.children ?? [])) { field in
            settingField(field)
          }
        } header: {
          Text(section.title)
        } footer: {
          if let description = section.description { Text(description) }
        }
      }
    }
    .formStyle(.grouped)
    .scrollDismissesKeyboard(.interactively)
    .refreshable { await model.load() }
  }

  @ViewBuilder
  private func settingField(_ field: StudioSiteSchemaResponse.Node) -> some View {
    if let key = field.key, let component = field.component {
      let helper = helperText(for: field)
      switch resolvedType(key: key, component: component) {
      case "color":
        VStack(alignment: .leading, spacing: 5) {
          ColorPicker(
            field.title,
            selection: Binding(
              get: { Self.color(from: model.draft[key] ?? "") ?? .accentColor },
              set: { model.draft[key] = Self.hex(from: $0) }
            ),
            supportsOpacity: key == "site.accentColor" ? false : (component.supportsOpacity ?? false)
          )
          helperView(helper)
        }
      case "multiSelect":
        VStack(alignment: .leading, spacing: 8) {
          Text(field.title).font(.subheadline.weight(.medium))
          ForEach(key == "site.map.providers" ? ["maplibre"] : (component.options ?? []), id: \.self) { option in
            Toggle(
              formatOption(option),
              isOn: Binding(
                get: { Self.multiSelect(model.draft[key] ?? "").contains(option) },
                set: { selected in
                  model.draft[key] = Self.updateMultiSelect(
                    model.draft[key] ?? "",
                    option: option,
                    selected: selected
                  )
                }
              )
            )
          }
          helperView(helper)
        }
      case "select":
        VStack(alignment: .leading, spacing: 8) {
          if key == "site.mapProjection" {
            Text(field.title).font(.subheadline.weight(.medium))
            Picker(field.title, selection: binding(for: key)) {
              ForEach(component.options ?? [], id: \.self) { option in
                Text(formatOption(option)).tag(option)
              }
            }
            .labelsHidden()
            .pickerStyle(.segmented)
          } else {
            if component.presentation == "navigationLink" {
              Picker(field.title, selection: binding(for: key)) {
                ForEach(component.options ?? [], id: \.self) { option in
                  Text(formatOption(option)).tag(option)
                }
              }
              .pickerStyle(.navigationLink)
            } else {
              Picker(field.title, selection: binding(for: key)) {
                ForEach(component.options ?? [], id: \.self) { option in
                  Text(formatOption(option)).tag(option)
                }
              }
              .pickerStyle(.menu)
            }
          }
          helperView(helper)
        }
      case "switch":
        VStack(alignment: .leading, spacing: 5) {
          Toggle(
            field.title,
            isOn: Binding(
              get: { model.draft[key] == "true" },
              set: { model.draft[key] = String($0) }
            )
          )
          helperView(helper)
        }
      case "secret":
        VStack(alignment: .leading, spacing: 5) {
          Text(field.title).font(.subheadline.weight(.medium))
          SecureField(component.placeholder ?? "", text: binding(for: key))
          helperView(helper)
        }
      case "textarea":
        VStack(alignment: .leading, spacing: 5) {
          Text(field.title).font(.subheadline.weight(.medium))
          TextField(component.placeholder ?? "", text: binding(for: key), axis: .vertical)
            .lineLimit((component.minRows ?? 3)...(component.maxRows ?? 6))
          helperView(helper)
        }
      case "slot":
        EmptyView()
      default:
        VStack(alignment: .leading, spacing: 5) {
          Text(field.title).font(.subheadline.weight(.medium))
          TextField(component.placeholder ?? "", text: binding(for: key))
            .keyboardType(keyboardType(component.inputType))
            .textInputAutocapitalization(
              identifierKey(key) || component.autoCapitalize == "none" ? .never : .sentences
            )
            .autocorrectionDisabled(identifierKey(key) || component.autoCorrect == false)
          helperView(helper)
        }
      }
    }
  }

  @ViewBuilder
  private func helperView(_ value: String?) -> some View {
    if let value, !value.isEmpty {
      Text(value).font(.caption).foregroundStyle(.secondary)
    }
  }

  private func binding(for key: String) -> Binding<String> {
    Binding(
      get: { model.draft[key] ?? "" },
      set: { model.draft[key] = $0 }
    )
  }

  private func resolvedType(
    key: String,
    component: StudioSiteSchemaResponse.Component
  ) -> String {
    if key == "site.accentColor" { return "color" }
    if key == "site.map.providers" { return "multiSelect" }
    return component.type
  }

  private func helperText(for field: StudioSiteSchemaResponse.Node) -> String? {
    switch field.key {
    case "site.accentColor": String(localized: "Choose a solid accent color for highlighted controls.")
    case "site.map.providers": String(localized: "Turn off every provider to disable map features.")
    case "site.mapProjection": String(localized: "Mercator is flat; Globe presents the world as a sphere.")
    default: field.helperText ?? field.description
    }
  }

  private func identifierKey(_ key: String) -> Bool {
    [
      "site.feed.folo.challenge.feedId",
      "site.feed.folo.challenge.userId",
      "site.mapStyle",
      "site.social.github",
      "site.social.twitter",
    ].contains(key)
  }

  private func keyboardType(_ inputType: String?) -> UIKeyboardType {
    switch inputType {
    case "url": .URL
    case "email": .emailAddress
    case "number": .numberPad
    default: .default
    }
  }

  private func formatOption(_ option: String) -> String {
    option == "maplibre" ? "MapLibre" : option.prefix(1).uppercased() + option.dropFirst()
  }

  private static func multiSelect(_ value: String) -> Set<String> {
    guard let data = value.data(using: .utf8),
          let values = try? JSONDecoder().decode([String].self, from: data)
    else { return [] }
    return Set(values)
  }

  private static func updateMultiSelect(
    _ value: String,
    option: String,
    selected: Bool
  ) -> String {
    var current = multiSelect(value)
    if selected { current.insert(option) } else { current.remove(option) }
    let values = current.sorted()
    guard let data = try? JSONEncoder().encode(values) else { return "[]" }
    return String(data: data, encoding: .utf8) ?? "[]"
  }

  private static func color(from value: String) -> Color? {
    let raw = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard raw.count == 6 || raw.count == 8, let number = UInt64(raw, radix: 16) else { return nil }
    let hasAlpha = raw.count == 8
    return Color(
      red: Double((number >> (hasAlpha ? 24 : 16)) & 0xff) / 255,
      green: Double((number >> (hasAlpha ? 16 : 8)) & 0xff) / 255,
      blue: Double((number >> (hasAlpha ? 8 : 0)) & 0xff) / 255,
      opacity: hasAlpha ? Double(number & 0xff) / 255 : 1
    )
  }

  private static func hex(from color: Color) -> String {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: nil)
    return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
  }
}
