import SwiftUI

struct WorkspaceSetupView: View {
  let mode: WorkspaceSetupMode

  @State private var model: WorkspaceSetupModel
  @State private var editingSlug = false
  @FocusState private var focus: Field?

  private enum Field {
    case name
    case slug
  }

  init(mode: WorkspaceSetupMode) {
    self.mode = mode
    let session = AfilmorySessionStore.shared.current().state.session
    _model = State(initialValue: WorkspaceSetupModel(
      displayName: session?.user.name ?? "",
      email: session?.user.email ?? "",
      check: { try await NativeAuthenticationService.shared.checkWorkspaceSlug($0) },
      create: { name, slug in
        let service = NativeAuthenticationService.shared
        let defaults = WorkspaceOnboardingDefaults.make(name: session?.user.name ?? "", email: session?.user.email ?? "")
        let created = try await service.submitWorkspaceCreation(name: name, slug: slug, settings: defaults.siteSettings(for: name))
        do {
          try await service.activateWorkspaceSession(cookie: created.cookie)
        } catch {
          try await service.activateWorkspaceSession(cookie: created.cookie)
        }
      }
    ))
  }

  var body: some View {
    ZStack {
      Color(AFColor.ground).ignoresSafeArea()
      switch mode {
      case .create:
        createContent
      case .waiting(let name, let slug):
        waitingContent(name: name, slug: slug)
      }
    }
    .preferredColorScheme(.dark)
    .tint(Color(AFColor.accentFallback))
  }

  private var host: String {
    ".\(ApiEnvironmentStore.shared.current().baseDomain)"
  }

  private var createContent: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        signOutRow
        Text("Name your gallery")
          .font(Font(AFFont.exhibit(size: 30, relativeTo: .title1)))
          .foregroundStyle(Color(AFColor.textPrimary))
          .accessibilityAddTraits(.isHeader)
          .padding(.bottom, 30)

        fieldLabel(String(localized: "Gallery name"))
        TextField("", text: $model.name)
          .font(Font(AFFont.exhibitUser(size: 34, relativeTo: .largeTitle)))
          .foregroundStyle(Color(AFColor.textPrimary))
          .focused($focus, equals: .name)
          .submitLabel(.next)
          .onSubmit { editingSlug = true; focus = .slug }
          .accessibilityLabel(String(localized: "Gallery name"))
          .accessibilityIdentifier("onboarding.name")
        Rectangle().fill(Color(AFColor.tick)).frame(height: 1).padding(.top, 8)

        fieldLabel(String(localized: "Gallery address")).padding(.top, 26)
        addressRow
        availabilityRow.padding(.top, 10)

        Text("This is your gallery's public address. Tap it to change. You can add your own domain later under Darkroom › Site.")
          .font(.system(size: 13))
          .foregroundStyle(Color(AFColor.textTertiary))
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 14)

        if let error = model.error {
          Text(error)
            .font(.system(size: 13))
            .foregroundStyle(Color(AFColor.destructive))
            .padding(.top, 14)
        }
      }
      .padding(.horizontal, 28)
      .padding(.bottom, 24)
      .frame(maxWidth: 480, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      Button(action: submit) {
        if model.busy {
          ProgressView().tint(Color(AFColor.onLight))
        } else {
          Text("Create and continue")
        }
      }
      .buttonStyle(.afPrimary)
      .disabled(!model.canSubmit)
      .frame(maxWidth: 432)
      .padding(.horizontal, 24)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity)
      .background(Color(AFColor.ground))
      .accessibilityIdentifier("onboarding.create")
    }
    .task(id: model.slug) {
      try? await Task.sleep(for: .milliseconds(400))
      guard !Task.isCancelled else { return }
      await model.checkAvailability()
    }
    .onAppear { focus = .name }
  }

  private var signOutRow: some View {
    HStack {
      Spacer()
      Button(String(localized: "Sign out"), action: signOut)
        .buttonStyle(.afText)
        .disabled(model.busy)
    }
    .padding(.top, 4)
    .padding(.bottom, 12)
  }

  private var addressRow: some View {
    HStack(spacing: 4) {
      if editingSlug {
        TextField("my-gallery", text: Binding(get: { model.slug }, set: { model.editSlug($0) }))
          .font(Font(AFFont.mono(size: 15)))
          .foregroundStyle(Color(AFColor.textPrimary))
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.asciiCapable)
          .focused($focus, equals: .slug)
          .submitLabel(.done)
          .onSubmit { editingSlug = false }
          .fixedSize()
          .padding(.horizontal, 10)
          .frame(height: 34)
          .background(Color(AFColor.fill), in: .rect(cornerRadius: 10, style: .continuous))
          .accessibilityIdentifier("onboarding.slug")
      } else {
        Button {
          editingSlug = true
          focus = .slug
        } label: {
          HStack(spacing: 6) {
            Text(model.slug.isEmpty ? "my-gallery" : model.slug)
              .foregroundStyle(Color(model.slug.isEmpty ? AFColor.textTertiary : AFColor.textPrimary))
            Image(systemName: "pencil").font(.system(size: 11, weight: .semibold))
              .foregroundStyle(Color(AFColor.textTertiary))
          }
          .font(Font(AFFont.mono(size: 15)))
          .padding(.horizontal, 10)
          .frame(height: 34)
          .background(Color(AFColor.fill), in: .rect(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "Gallery address"))
        .accessibilityValue(model.slug + host)
        .accessibilityHint(String(localized: "Double-tap to edit"))
      }
      Text(host)
        .font(Font(AFFont.mono(size: 15)))
        .foregroundStyle(Color(AFColor.textTertiary))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
  }

  @ViewBuilder private var availabilityRow: some View {
    switch model.availability {
    case .idle:
      Color.clear.frame(height: 18)
    case .checking:
      ProgressView().controlSize(.small).frame(height: 18)
    case .available:
      Label(String(localized: "Available"), systemImage: "checkmark")
        .font(Font(AFFont.mono(size: 12)))
        .foregroundStyle(Color(AFColor.accentFallback))
    case .unavailable(let suggestion):
      HStack(spacing: 10) {
        Text("Already taken")
          .font(Font(AFFont.mono(size: 12)))
          .foregroundStyle(Color(AFColor.destructive))
        if let suggestion {
          Button(String(localized: "Use \(suggestion)")) {
            model.useSuggestion()
            editingSlug = false
          }
          .font(Font(AFFont.mono(size: 12)))
          .foregroundStyle(Color(AFColor.textPrimary))
        }
      }
    case .invalid:
      Text("At least three lowercase letters, numbers or hyphens.")
        .font(Font(AFFont.mono(size: 12)))
        .foregroundStyle(Color(AFColor.textTertiary))
    case .failed:
      Text("The URL identifier could not be checked. Please try again.")
        .font(Font(AFFont.mono(size: 12)))
        .foregroundStyle(Color(AFColor.textTertiary))
    }
  }

  private func fieldLabel(_ text: String) -> some View {
    Text(text)
      .font(Font(AFFont.mono(size: 12)))
      .tracking(0.5)
      .foregroundStyle(Color(AFColor.textTertiary))
      .padding(.bottom, 8)
  }

  private func waitingContent(name: String, slug: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      signOutRow
      Text("Your workspace is still being set up")
        .font(Font(AFFont.exhibit(size: 30, relativeTo: .title1)))
        .foregroundStyle(Color(AFColor.textPrimary))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      Text("“\(name)” is not ready yet. Sign out and come back later, or continue from another device.")
        .font(.system(size: 15))
        .foregroundStyle(Color(AFColor.textSecondary))
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 12)
      VStack(alignment: .leading, spacing: 4) {
        Text(name).font(Font(AFFont.exhibitUser(size: 20)))
          .foregroundStyle(Color(AFColor.textPrimary))
        Text(slug + host).font(Font(AFFont.mono(size: 13)))
          .foregroundStyle(Color(AFColor.textTertiary))
      }
      .padding(.top, 26)
      Spacer()
    }
    .padding(.horizontal, 28)
    .frame(maxWidth: 480, alignment: .leading)
    .frame(maxWidth: .infinity)
  }

  private func submit() {
    focus = nil
    Task { @MainActor in
      do {
        try await model.submit()
      } catch {
        model.error = String(localized: "The workspace could not be created. The identifier may already be in use.")
      }
    }
  }

  private func signOut() {
    Task { @MainActor in
      await NativeAuthenticationService.shared.signOut()
    }
  }
}
