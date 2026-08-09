import SwiftUI

struct AccountSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var appleAvailable = false
  @State private var busy = false
  @State private var error: String?
  @State private var impact: AccountDeletionImpact?
  @State private var password = ""
  @State private var showAcceptedAlert = false
  @State private var showPasswordConfirmation = false

  let session: AfilmorySession?
  let startsDeletion: Bool

  var body: some View {
    NavigationStack {
      Group {
        if let session {
          ScrollView {
            if let impact {
              deletionContent(impact)
            } else {
              identityContent(session)
            }
          }
        } else {
          ContentUnavailableView(
            Localization.t("account.signedOut"),
            systemImage: "person.crop.circle.badge.xmark"
          )
        }
      }
      .navigationTitle(Localization.t("account.settings.title"))
      .navigationBarTitleDisplayMode(.inline)
      .task {
        if startsDeletion, impact == nil {
          await inspectDeletion()
        }
      }
      .alert(Localization.t("account.deletion.finalTitle"), isPresented: $showPasswordConfirmation) {
        Button(Localization.t("common.cancel"), role: .cancel) {}
        Button(Localization.t("account.deletion.confirm"), role: .destructive) {
          submitDeletion(.password(password))
        }
      } message: {
        Text(Localization.t("account.deletion.finalDescription"))
      }
      .alert(Localization.t("account.deletion.acceptedTitle"), isPresented: $showAcceptedAlert) {
        Button(Localization.t("common.done")) { dismiss() }
      } message: {
        Text(Localization.t("account.deletion.acceptedDescription"))
      }
    }
  }

  private func identityContent(_ session: AfilmorySession) -> some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 4) {
        Text(session.user.name)
          .font(.system(size: 18, weight: .bold))
        Text(session.user.email)
          .font(.system(size: 14))
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(18)
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 16, style: .continuous))

      VStack(spacing: 0) {
        Button {
          Task { @MainActor in
            await NativeAuthenticationService.shared.signOut()
            dismiss()
          }
        } label: {
          HStack {
            Text(Localization.t("common.signOut"))
            Spacer()
          }
          .padding(.horizontal, 16)
          .frame(height: 50)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        Divider().padding(.leading, 16)
        Button {
          Task { await inspectDeletion() }
        } label: {
          HStack {
            Text(Localization.t("account.deletion.action"))
              .foregroundStyle(.red)
            Spacer()
            if busy { ProgressView().tint(.red) }
          }
          .padding(.horizontal, 16)
          .frame(height: 50)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(busy)
      }
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 16, style: .continuous))

      Text(Localization.t("account.deletion.entryDescription"))
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
        .lineSpacing(2)
        .padding(.horizontal, 4)

      errorText
    }
    .padding(20)
    .padding(.bottom, 28)
  }

  private func deletionContent(_ impact: AccountDeletionImpact) -> some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 8) {
        Text(Localization.t("account.deletion.title"))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(.red)
        Text(Localization.t("account.deletion.description"))
          .font(.system(size: 14))
          .foregroundStyle(.secondary)
          .lineSpacing(3)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)
      .background(Color.red.opacity(0.1))
      .clipShape(.rect(cornerRadius: 16, style: .continuous))

      if !impact.workspaces.isEmpty {
        VStack(alignment: .leading, spacing: 10) {
          Text(Localization.t("account.deletion.workspaces"))
            .font(.system(size: 14, weight: .bold))
          ForEach(impact.workspaces) { workspace in
            HStack(spacing: 12) {
              VStack(alignment: .leading, spacing: 3) {
                Text(workspace.name)
                  .font(.system(size: 14, weight: .semibold))
                Text(workspaceDescription(workspace))
                  .font(.system(size: 12))
                  .foregroundStyle(.secondary)
              }
              Spacer()
              Text(
                Localization.t(
                  workspace.action == "delete"
                    ? "account.deletion.deleteBadge"
                    : "account.deletion.transferBadge"
                )
              )
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(workspace.action == "delete" ? .red : .blue)
            }
            .padding(14)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(.rect(cornerRadius: 12, style: .continuous))
          }
        }
      }

      Text(
        Localization.t(
          "account.deletion.associatedData",
          [
            "joined": String(impact.joinedWorkspaces.count),
            "subscriptions": String(impact.subscriptions.count),
          ]
        )
      )
      .font(.system(size: 14))
      .foregroundStyle(.secondary)
      .lineSpacing(3)

      if impact.proofMethods.contains("password") {
        VStack(alignment: .leading, spacing: 10) {
          Text(Localization.t("account.deletion.verifyPassword"))
            .font(.system(size: 14, weight: .bold))
          SecureField(Localization.t("auth.password.password"), text: $password)
            .textContentType(.password)
            .submitLabel(.done)
            .onSubmit(confirmPasswordDeletion)
            .afilmoryAccountField()
          destructiveButton(action: confirmPasswordDeletion)
        }
      }

      if impact.proofMethods.contains("apple"), appleAvailable {
        VStack(alignment: .leading, spacing: 10) {
          Text(Localization.t("account.deletion.verifyApple"))
            .font(.system(size: 14, weight: .bold))
          NativeAppleAuthorizationButton(type: .signIn) {
            submitAppleDeletion()
          }
          .frame(height: 48)
          .disabled(busy)
          .opacity(busy ? 0.45 : 1)
        }
      }

      if impact.proofMethods.contains("recent-session") {
        destructiveButton { submitDeletion(.recentSession) }
      }

      errorText
    }
    .padding(20)
    .padding(.bottom, 28)
  }

  private var errorText: some View {
    Group {
      if let error {
        Text(error)
          .font(.system(size: 13))
          .foregroundStyle(.red)
          .frame(maxWidth: .infinity)
          .multilineTextAlignment(.center)
          .accessibilityAddTraits(.isStaticText)
      }
    }
  }

  private func destructiveButton(action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Group {
        if busy {
          ProgressView().tint(.white)
        } else {
          Text(Localization.t("account.deletion.confirm"))
            .font(.system(size: 15, weight: .bold))
        }
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background(.red)
      .clipShape(.rect(cornerRadius: 14, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(busy)
  }

  private func workspaceDescription(_ workspace: AccountDeletionImpact.Workspace) -> String {
    if workspace.action == "transfer", let target = workspace.transferTo {
      return Localization.t("account.deletion.transferTo", ["name": target.name])
    }
    return Localization.t("account.deletion.deleteWorkspace")
  }

  private func inspectDeletion() async {
    guard !busy else { return }
    busy = true
    error = nil
    do {
      async let nextImpact = NativeAuthenticationService.shared.loadAccountDeletionImpact()
      async let available = NativeAuthenticationService.shared.isAppleAuthenticationAvailable()
      impact = try await nextImpact
      appleAvailable = await available
    } catch {
      self.error = Localization.t("account.deletion.impactFailed")
    }
    busy = false
  }

  private func confirmPasswordDeletion() {
    guard !password.isEmpty else {
      error = Localization.t("account.deletion.passwordRequired")
      return
    }
    showPasswordConfirmation = true
  }

  private func submitAppleDeletion() {
    guard !busy else { return }
    busy = true
    error = nil
    Task { @MainActor in
      defer { busy = false }
      do {
        guard let anchor = UIApplication.shared.afilmoryPresentationAnchor else {
          throw NativeAuthError.unavailable
        }
        let proof = try await NativeAuthenticationService.shared.appleDeletionProof(anchor: anchor)
        _ = try await NativeAuthenticationService.shared.deleteAccount(proof: proof)
        showAcceptedAlert = true
      } catch NativeAuthError.cancelled {
        return
      } catch {
        self.error = Localization.t("account.deletion.failed")
      }
    }
  }

  private func submitDeletion(_ proof: AccountDeletionProof) {
    guard !busy else { return }
    busy = true
    error = nil
    Task { @MainActor in
      defer { busy = false }
      do {
        _ = try await NativeAuthenticationService.shared.deleteAccount(proof: proof)
        showAcceptedAlert = true
      } catch {
        self.error = Localization.t("account.deletion.failed")
      }
    }
  }
}

private extension View {
  func afilmoryAccountField() -> some View {
    padding(.horizontal, 14)
      .frame(height: 48)
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }
  }
}
