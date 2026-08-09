import SwiftUI

struct WorkspaceSetupView: View {
  @Environment(\.dismiss) private var dismiss
  @FocusState private var focusedField: Field?
  @State private var busy = false
  @State private var error: String?
  @State private var name = ""
  @State private var slug = ""
  @State private var slugEdited = false

  private enum Field {
    case name
    case slug
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 8) {
            Text(Localization.t("workspace.setup.title"))
              .font(.system(size: 24, weight: .bold))
            Text(Localization.t("workspace.setup.description"))
              .font(.system(size: 15))
              .foregroundStyle(.secondary)
              .lineSpacing(3)
          }

          VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
              Text(Localization.t("workspace.setup.name"))
                .font(.system(size: 13, weight: .semibold))
              TextField(Localization.t("workspace.setup.namePlaceholder"), text: $name)
                .submitLabel(.next)
                .focused($focusedField, equals: .name)
                .onChange(of: name) { _, value in
                  if !slugEdited { slug = Self.normalizeSlug(value) }
                }
                .onSubmit { focusedField = .slug }
                .afilmoryWorkspaceField()
            }
            VStack(alignment: .leading, spacing: 7) {
              Text(Localization.t("workspace.setup.slug"))
                .font(.system(size: 13, weight: .semibold))
              TextField("my-gallery", text: $slug)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.done)
                .focused($focusedField, equals: .slug)
                .onChange(of: slug) { _, value in
                  let normalized = Self.normalizeSlug(value)
                  slugEdited = true
                  if normalized != value { slug = normalized }
                }
                .onSubmit(submit)
                .afilmoryWorkspaceField()
              Text(Localization.t("workspace.setup.slugHint"))
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
            }
          }

          if let error {
            Text(error)
              .font(.system(size: 13))
              .foregroundStyle(.red)
              .accessibilityAddTraits(.isStaticText)
          }

          AfilmoryButton(prominent: true, action: submit) {
            Group {
              if busy {
                ProgressView()
              } else {
                Text(Localization.t("workspace.setup.submit"))
                  .font(.system(size: 15, weight: .bold))
              }
            }
            .frame(maxWidth: .infinity, minHeight: 48)
          }
          .disabled(busy)

          Button {
            Task { @MainActor in
              await NativeAuthenticationService.shared.signOut()
              dismiss()
            }
          } label: {
            Text(Localization.t("common.signOut"))
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, minHeight: 48)
          }
          .buttonStyle(.plain)
          .disabled(busy)
        }
        .padding(24)
        .padding(.bottom, 16)
      }
      .navigationTitle(Localization.t("workspace.setup.pageTitle"))
      .navigationBarTitleDisplayMode(.inline)
      .task { focusedField = .name }
    }
  }

  private func submit() {
    let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedSlug = Self.normalizeSlug(slug.isEmpty ? name : slug)
    guard !normalizedName.isEmpty, normalizedSlug.count >= 2 else {
      error = Localization.t("workspace.setup.required")
      return
    }
    guard !busy else { return }
    busy = true
    error = nil
    Task { @MainActor in
      defer { busy = false }
      do {
        try await NativeAuthenticationService.shared.createWorkspace(
          name: normalizedName,
          slug: normalizedSlug
        )
        dismiss()
      } catch {
        self.error = Localization.t("workspace.setup.failed")
      }
    }
  }

  static func normalizeSlug(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
      .replacingOccurrences(of: "[^a-z0-9-]", with: "", options: .regularExpression)
      .replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
      .replacingOccurrences(of: "^-+|-+$", with: "", options: .regularExpression)
  }
}

private extension View {
  func afilmoryWorkspaceField() -> some View {
    padding(.horizontal, 14)
      .frame(height: 48)
      .background(Color(uiColor: .secondarySystemBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }
  }
}
