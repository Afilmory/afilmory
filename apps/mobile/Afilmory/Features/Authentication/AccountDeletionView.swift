import SwiftUI
import UIKit

final class AccountDeletionController: UIHostingController<AccountDeletionView> {
  init(session: AfilmorySession?) {
    super.init(rootView: AccountDeletionView(session: session, onClose: {}))
    rootView = AccountDeletionView(session: session, onClose: { [weak self] in self?.dismiss(animated: true) })
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
  }
}

enum AccountDeletionVerification: Equatable {
  case recentSession
  case apple
  case password
  case signInAgain

  static func choose(methods: [String], appleAvailable: Bool) -> AccountDeletionVerification {
    if methods.contains("recent-session") { return .recentSession }
    if methods.contains("apple"), appleAvailable { return .apple }
    if methods.contains("password") { return .password }
    return .signInAgain
  }
}

struct AccountDeletionView: View {
  let session: AfilmorySession?
  let onClose: () -> Void

  @State private var appleAvailable = false
  @State private var busy = false
  @State private var error: String?
  @State private var impact: AccountDeletionImpact?
  @State private var password = ""
  @State private var showAcceptedAlert = false
  @State private var showPasswordConfirmation = false

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Color(AFColor.ground).ignoresSafeArea()
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("Permanent account deletion")
            .font(Font(AFFont.exhibit(size: 30, relativeTo: .title1)))
            .foregroundStyle(Color(AFColor.textPrimary))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, 56)
          Text("Review the consequences below. Once accepted, access is revoked immediately and the operation cannot be reversed.")
            .font(.system(size: 15))
            .foregroundStyle(Color(AFColor.textSecondary))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 12)

          if session == nil {
            Text("This account is no longer signed in.")
              .font(.system(size: 15))
              .foregroundStyle(Color(AFColor.textTertiary))
              .padding(.top, 26)
          } else if let impact {
            consequences(impact)
          } else if busy {
            ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
          }

          if let error {
            Text(error)
              .font(.system(size: 13))
              .foregroundStyle(Color(AFColor.destructive))
              .padding(.top, 16)
          }
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 32)
        .frame(maxWidth: 480, alignment: .leading)
        .frame(maxWidth: .infinity)
      }
      .scrollDismissesKeyboard(.interactively)

      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Color(AFColor.textPrimary))
          .frame(width: 44, height: 44)
          .background(Color(AFColor.fill), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(String(localized: "Close"))
      .padding(.trailing, 16)
      .padding(.top, 8)
    }
    .preferredColorScheme(.dark)
    .task {
      if session != nil, impact == nil { await inspectDeletion() }
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
      Button(String(localized: "Done"), action: onClose)
    } message: {
      Text("Access has been revoked. Cleanup will continue safely in the background.")
    }
  }

  private func consequences(_ impact: AccountDeletionImpact) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      if !impact.workspaces.isEmpty {
        sectionLabel(String(localized: "Owned workspaces")).padding(.top, 28)
        VStack(spacing: 0) {
          ForEach(impact.workspaces) { workspace in
            HStack(spacing: 12) {
              VStack(alignment: .leading, spacing: 3) {
                Text(workspace.name)
                  .font(Font(AFFont.exhibitUser(size: 17)))
                  .foregroundStyle(Color(AFColor.textPrimary))
                Text(workspaceDescription(workspace))
                  .font(.system(size: 13))
                  .foregroundStyle(Color(AFColor.textTertiary))
              }
              Spacer()
              Text(workspace.action == "delete" ? "DELETE" : "TRANSFER")
                .font(Font(AFFont.mono(size: 11)))
                .foregroundStyle(Color(workspace.action == "delete" ? AFColor.destructive : AFColor.textSecondary))
            }
            .padding(16)
          }
        }
        .background(Color(AFColor.raised), in: .rect(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color(AFColor.fill), lineWidth: 1))
      }

      Text(
        "Your comments, reactions, followed galleries, device registrations, and other account data will be removed. \(impact.joinedWorkspaces.count) joined workspaces will be left. \(impact.subscriptions.count) subscriptions require cleanup."
      )
      .font(.system(size: 14))
      .foregroundStyle(Color(AFColor.textSecondary))
      .fixedSize(horizontal: false, vertical: true)
      .padding(.top, 20)

      switch AccountDeletionVerification.choose(methods: impact.proofMethods, appleAvailable: appleAvailable) {
      case .recentSession:
        destructiveButton { submitDeletion(.recentSession) }.padding(.top, 28)
      case .apple:
        sectionLabel(String(localized: "Verify with Apple to delete the account")).padding(.top, 28)
        NativeAppleAuthorizationButton(type: .signIn, cornerRadius: 26) {
          submitAppleDeletion()
        }
        .frame(height: 52)
        .disabled(busy)
        .opacity(busy ? 0.45 : 1)
      case .password:
        sectionLabel(String(localized: "Confirm with your current password")).padding(.top, 28)
        SecureField(String(localized: "Password"), text: $password)
          .textContentType(.password)
          .submitLabel(.done)
          .onSubmit(confirmPasswordDeletion)
          .afSheetField()
        destructiveButton(action: confirmPasswordDeletion).padding(.top, 12)
      case .signInAgain:
        Text("For your security, sign out and sign in again, then delete the account within a few minutes.")
          .font(.system(size: 14))
          .foregroundStyle(Color(AFColor.textSecondary))
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 28)
        Button(String(localized: "Sign out")) {
          onClose()
          AppNavigator.shared.signOut()
        }
        .buttonStyle(.afFill)
        .padding(.top, 14)
      }
    }
  }

  private func sectionLabel(_ text: String) -> some View {
    Text(text)
      .font(Font(AFFont.mono(size: 11)))
      .tracking(0.6)
      .foregroundStyle(Color(AFColor.textTertiary))
      .padding(.bottom, 10)
  }

  private func destructiveButton(action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Group {
        if busy {
          ProgressView().tint(Color(AFColor.onLight))
        } else {
          Text("Permanently delete account")
        }
      }
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(Color(AFColor.onLight))
      .frame(maxWidth: .infinity, minHeight: 52)
      .background(Color(AFColor.destructive), in: Capsule())
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
