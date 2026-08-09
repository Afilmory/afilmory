import SwiftUI

private enum ProbeResult: Equatable {
  case idle
  case probing
  case done(label: String, reachable: Bool)
}

struct DeveloperLabView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var selectedPreset: String
  @State private var customPlatformHost: String
  @State private var customBaseDomain: String
  @State private var customPort: String
  @State private var customScheme: String
  @State private var probe: ProbeResult = .idle
  @State private var email = "root@local.host"
  @State private var password = ""
  @State private var signInNote: String?

  init() {
    let environment = ApiEnvironmentStore.shared.current()
    _selectedPreset = State(initialValue: ["local", "production"].contains(environment.id) ? environment.id : "custom")
    _customPlatformHost = State(initialValue: environment.platformHost)
    _customBaseDomain = State(initialValue: environment.baseDomain)
    _customPort = State(initialValue: environment.port.map(String.init) ?? "")
    _customScheme = State(initialValue: environment.scheme)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        environmentBanner
        sectionHeading(
          eyebrow: "API ENVIRONMENT",
          title: "Backend target",
          subtitle: "Select the local stack or the production service, then reload the app."
        )
        environmentCard
        sectionHeading(
          eyebrow: "COMPONENT LAB",
          title: "Comment send flight",
          subtitle: "Native comments sheet on demo data — verify bubbles and the send animation."
        )
        commentsCard
      }
      .padding(.horizontal, 18)
      .padding(.top, 18)
      .padding(.bottom, 48)
    }
    .scrollIndicators(.hidden)
    .scrollDismissesKeyboard(.interactively)
    .background(.black)
    .navigationTitle("UI Lab")
    .navigationBarTitleDisplayMode(.large)
  }

  private var environmentBanner: some View {
    HStack(spacing: 12) {
      Image(systemName: "hammer.fill")
        .font(.system(size: 15))
        .foregroundStyle(Color(red: 77 / 255, green: 163 / 255, blue: 1))
        .frame(width: 34, height: 34)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text("Development environment").font(.system(size: 14, weight: .bold))
        Text("Configure and verify the API endpoint used by this build.")
          .font(.system(size: 12))
          .foregroundStyle(.secondary)
      }
      Spacer()
      Text("DEV")
        .font(.system(size: 10, weight: .heavy))
        .tracking(0.8)
        .foregroundStyle(Color(red: 77 / 255, green: 163 / 255, blue: 1))
    }
    .padding(14)
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(Color(uiColor: .separator), lineWidth: 0.5)
    }
  }

  private func sectionHeading(eyebrow: String, title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(eyebrow)
        .font(.system(size: 10, weight: .heavy))
        .tracking(1.2)
        .foregroundStyle(Color(red: 77 / 255, green: 163 / 255, blue: 1))
      Text(title)
        .font(.system(size: 24, weight: .bold))
        .tracking(-0.4)
      Text(subtitle)
        .font(.system(size: 13))
        .foregroundStyle(.secondary)
    }
  }

  private var environmentCard: some View {
    VStack(spacing: 14) {
      Picker("Environment", selection: $selectedPreset) {
        Text("Local").tag("local")
        Text("Production").tag("production")
        Text("Custom").tag("custom")
      }
      .pickerStyle(.segmented)
      .onChange(of: selectedPreset) { previous, value in
        if value == "custom" {
          if previous == "local" {
            loadCustomFields(from: .local)
          } else if previous == "production" {
            loadCustomFields(from: .production)
          }
        }
        probe = .idle
      }

      if selectedPreset == "custom" {
        VStack(spacing: 10) {
          labField("Platform host", text: $customPlatformHost, placeholder: "localhost:1841")
          labField("Tenant base domain", text: $customBaseDomain, placeholder: "localhost")
          labField("Tenant port", text: $customPort, placeholder: "1841")
          labField("Scheme", text: $customScheme, placeholder: "http")
        }
      }

      VStack(alignment: .leading, spacing: 3) {
        labPreviewLabel("PLATFORM")
        Text("\(platformOrigin(draft))/api").font(.system(size: 11, design: .monospaced))
        labPreviewLabel("TENANT")
        Text("\(tenantOrigin(draft, slug: "example"))/api").font(.system(size: 11, design: .monospaced))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(10)
      .background(.black)
      .clipShape(.rect(cornerRadius: 10, style: .continuous))

      HStack(spacing: 8) {
        labButton(probe == .probing ? "Probing…" : "Probe", prominent: false) {
          Task { await runProbe() }
        }
        labButton("Apply & reload", prominent: true) {
          applyEnvironment()
        }
        .disabled(!isDirty)
        .opacity(isDirty ? 1 : 0.4)
      }

      labButton("Reset to \(AfilmoryBuildConfiguration.defaultApiEnvironment.label)", prominent: false) {
        ApiEnvironmentStore.shared.resetToBuildDefault()
        AfilmorySessionStore.shared.clearSession()
        dismiss()
      }
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }

      if case .done(let label, let reachable) = probe {
        Text("\(reachable ? "reachable" : "failed") · \(label)")
          .font(.system(size: 11, design: .monospaced))
          .foregroundStyle(reachable ? Color.secondary : Color.red)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      VStack(alignment: .leading, spacing: 10) {
        Text(sessionLabel)
          .font(.system(size: 9, weight: .regular, design: .monospaced))
          .tracking(0.8)
          .foregroundStyle(.secondary)
        labField("Email", text: $email, placeholder: "root@local.host")
        labField("Password", text: $password, placeholder: "password", secure: true)
        labButton("Sign in", prominent: false) {
          signInNote = "signing in…"
          Task { @MainActor in
            do {
              try await NativeAuthenticationService.shared.signInWithPassword(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
              )
              signInNote = "signed in"
            } catch {
              signInNote = error.localizedDescription
            }
          }
        }
        if let signInNote {
          Text(signInNote).font(.system(size: 11, design: .monospaced))
        }
      }
    }
    .padding(14)
    .background(Color(uiColor: .secondarySystemBackground))
    .clipShape(.rect(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(Color(uiColor: .separator), lineWidth: 0.5)
    }
  }

  private var commentsCard: some View {
    VStack(spacing: 0) {
      commentsRow(
        icon: "paperplane.fill",
        title: "Send flight · success",
        description: "Optimistic bubble flies from the composer and settles in the list."
      ) {
        CommentsLabPresenter.present(outcome: "success", latencyMs: 800)
      }
      Divider()
      commentsRow(
        icon: "exclamationmark.arrow.circlepath",
        title: "Send flight · failure",
        description: "Request fails after the flight; the bubble rolls back and the draft is restored."
      ) {
        CommentsLabPresenter.present(outcome: "failure", latencyMs: 800)
      }
    }
    .clipShape(.rect(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(Color(uiColor: .separator), lineWidth: 0.5)
    }
  }

  private func commentsRow(
    icon: String,
    title: String,
    description: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 14))
          .foregroundStyle(Color(red: 77 / 255, green: 163 / 255, blue: 1))
          .frame(width: 34, height: 34)
          .background(Color(uiColor: .secondarySystemBackground))
          .clipShape(.rect(cornerRadius: 10, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 14, weight: .semibold))
          Text(description).font(.system(size: 12)).foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(.tertiary)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 13)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }

  private func labField(
    _ label: String,
    text: Binding<String>,
    placeholder: String,
    secure: Bool = false
  ) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(label)
        .font(.system(size: 9, design: .monospaced))
        .tracking(0.8)
        .foregroundStyle(.secondary)
      Group {
        if secure {
          SecureField(placeholder, text: text)
        } else {
          TextField(placeholder, text: text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
      }
      .font(.system(size: 12, design: .monospaced))
      .padding(.horizontal, 10)
      .frame(minHeight: 36)
      .background(.black)
      .clipShape(.rect(cornerRadius: 9, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 9, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }
    }
  }

  private func labPreviewLabel(_ value: String) -> some View {
    Text(value)
      .font(.system(size: 9, design: .monospaced))
      .tracking(0.8)
      .foregroundStyle(Color(red: 77 / 255, green: 163 / 255, blue: 1))
  }

  private func labButton(_ title: String, prominent: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12, weight: prominent ? .bold : .semibold))
        .frame(maxWidth: .infinity, minHeight: 38)
        .background(prominent ? Color.accentColor : Color(uiColor: .tertiarySystemBackground))
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private var isDirty: Bool {
    let active = ApiEnvironmentStore.shared.current()
    return draft.scheme != active.scheme
      || draft.platformHost != active.platformHost
      || draft.baseDomain != active.baseDomain
      || draft.port != active.port
  }

  private var draft: ApiEnvironment {
    if selectedPreset == "local" {
      return .local
    }
    if selectedPreset == "production" {
      return .production
    }
    return ApiEnvironment(
      id: "custom",
      label: "Custom",
      scheme: customScheme.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      platformHost: customPlatformHost.trimmingCharacters(in: .whitespacesAndNewlines),
      baseDomain: customBaseDomain.trimmingCharacters(in: .whitespacesAndNewlines),
      port: Int(customPort.trimmingCharacters(in: .whitespacesAndNewlines))
    )
  }

  private var sessionLabel: String {
    if let session = AfilmorySessionStore.shared.current().state.session {
      return "SIGNED IN AS \(session.user.email)"
    }
    return "PASSWORD SIGN-IN"
  }

  private func runProbe() async {
    probe = .probing
    guard let url = URL(string: "\(platformOrigin(draft))/api/auth/session") else {
      probe = .done(label: "invalid URL", reachable: false)
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 4
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        probe = .done(label: "invalid response", reachable: false)
        return
      }
      probe = .done(label: "HTTP \(http.statusCode)", reachable: http.statusCode < 500)
    } catch {
      probe = .done(label: error.localizedDescription, reachable: false)
    }
  }

  private func applyEnvironment() {
    do {
      try ApiEnvironmentStore.shared.set(draft)
      AfilmorySessionStore.shared.clearSession()
      dismiss()
    } catch {
      probe = .done(label: error.localizedDescription, reachable: false)
    }
  }

  private func loadCustomFields(from environment: ApiEnvironment) {
    customPlatformHost = environment.platformHost
    customBaseDomain = environment.baseDomain
    customPort = environment.port.map(String.init) ?? ""
    customScheme = environment.scheme
  }

  private func platformOrigin(_ environment: ApiEnvironment) -> String {
    "\(environment.scheme)://\(environment.platformHost)"
  }

  private func tenantOrigin(_ environment: ApiEnvironment, slug: String) -> String {
    let port = environment.port.map { ":\($0)" } ?? ""
    return "\(environment.scheme)://\(slug).\(environment.baseDomain)\(port)"
  }
}
