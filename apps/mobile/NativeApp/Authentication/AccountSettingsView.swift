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
            String(localized: "This account is no longer signed in."),
            systemImage: "person.crop.circle.badge.xmark"
          )
        }
      }
      .navigationTitle(String(localized: "Account settings"))
      .navigationBarTitleDisplayMode(.inline)
      .task {
        if startsDeletion, impact == nil {
          await inspectDeletion()
        }
      }
      .alert(String(localized: "Delete this account?"), isPresented: $showPasswordConfirmation) {
        Button(String(localized: "Cancel"), role: .cancel) {}
        Button(String(localized: "Permanently delete account"), role: .destructive) {
          submitDeletion(.password(password))
        }
      } message: {
        Text("This permanently removes your account and cannot be undone.")
      }
      .alert(String(localized: "Deletion in progress"), isPresented: $showAcceptedAlert) {
        Button(String(localized: "Done")) { dismiss() }
      } message: {
        Text("Access has been revoked. Cleanup will continue safely in the background.")
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
            Text("Sign out")
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
            Text("Delete account")
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

      Text("A deletion request signs out every device and permanently removes account data after external storage and billing cleanup.")
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
        Text("Permanent account deletion")
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(.red)
        Text("Review the consequences below. Once accepted, access is revoked immediately and the operation cannot be reversed.")
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
          Text("Owned workspaces")
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
              Text(workspace.action == "delete" ? "DELETE" : "TRANSFER")
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
        "Your comments, reactions, followed galleries, device registrations, and other account data will be removed. \(impact.joinedWorkspaces.count) joined workspaces will be left. \(impact.subscriptions.count) subscriptions require cleanup."
      )
      .font(.system(size: 14))
      .foregroundStyle(.secondary)
      .lineSpacing(3)

      if impact.proofMethods.contains("password") {
        VStack(alignment: .leading, spacing: 10) {
          Text("Confirm with your current password")
            .font(.system(size: 14, weight: .bold))
          SecureField(String(localized: "Password"), text: $password)
            .textContentType(.password)
            .submitLabel(.done)
            .onSubmit(confirmPasswordDeletion)
            .afilmoryAccountField()
          destructiveButton(action: confirmPasswordDeletion)
        }
      }

      if impact.proofMethods.contains("apple"), appleAvailable {
        VStack(alignment: .leading, spacing: 10) {
          Text("Verify with Apple to delete the account")
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
          Text("Permanently delete account")
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
      return String(localized: "Ownership will transfer to \(target.name).")
    }
    return String(localized: "This workspace and its managed storage will be deleted.")
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
      self.error = String(localized: "Unable to inspect the deletion impact. Please try again.")
    }
    busy = false
  }

  private func confirmPasswordDeletion() {
    guard !password.isEmpty else {
      error = String(localized: "Enter your current password to continue.")
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
        self.error = String(localized: "The deletion request could not be accepted. Verify your identity and try again.")
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
        self.error = String(localized: "The deletion request could not be accepted. Verify your identity and try again.")
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
