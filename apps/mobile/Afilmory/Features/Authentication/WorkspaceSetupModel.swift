import Foundation
import Observation

@MainActor
@Observable
final class WorkspaceSetupModel {
  enum Availability: Equatable {
    case idle
    case checking
    case available
    case unavailable(suggestion: String?)
    case invalid
    case failed
  }

  typealias Check = @MainActor (String) async throws -> WorkspaceSlugCheck
  typealias Create = @MainActor (_ name: String, _ slug: String) async throws -> Void

  var name: String
  private(set) var slug: String
  private(set) var slugEdited = false
  private(set) var availability: Availability = .idle
  var busy = false
  var error: String?

  @ObservationIgnored private let flags: OnboardingFlags
  @ObservationIgnored private let check: Check
  @ObservationIgnored private let create: Create

  init(displayName: String, email: String, flags: OnboardingFlags = .shared, check: @escaping Check, create: @escaping Create) {
    let defaults = WorkspaceOnboardingDefaults.make(name: displayName, email: email)
    name = defaults.workspaceName
    slug = Self.defaultSlug(displayName: displayName, email: email)
    self.flags = flags
    self.check = check
    self.create = create
    if slug.count < WorkspaceSlugResolver.minimumLength { availability = .invalid }
  }

  static func defaultSlug(displayName: String, email: String) -> String {
    let fromName = WorkspaceOnboardingDefaults.normalizeSlug(displayName)
    if fromName.count >= WorkspaceSlugResolver.minimumLength { return fromName }
    let local = email.split(separator: "@").first.map(String.init) ?? ""
    return WorkspaceOnboardingDefaults.normalizeSlug(local)
  }

  var trimmedName: String {
    name.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var canSubmit: Bool {
    guard !busy, !trimmedName.isEmpty, slug.count >= WorkspaceSlugResolver.minimumLength else { return false }
    if case .unavailable = availability { return false }
    return availability != .invalid
  }

  func editSlug(_ raw: String) {
    slug = WorkspaceOnboardingDefaults.normalizeSlug(raw)
    slugEdited = true
    error = nil
    availability = slug.count < WorkspaceSlugResolver.minimumLength ? .invalid : .idle
  }

  func useSuggestion() {
    guard case .unavailable(let suggestion?) = availability else { return }
    slug = suggestion
    slugEdited = true
    availability = .available
  }

  func checkAvailability() async {
    let candidate = slug
    guard candidate.count >= WorkspaceSlugResolver.minimumLength else {
      availability = .invalid
      return
    }
    availability = .checking
    do {
      switch try await check(candidate) {
      case .available:
        guard slug == candidate else { return }
        availability = .available
      case .unavailable:
        let suggestion = try await WorkspaceSlugResolver.firstAvailable(base: candidate, check: check)
        guard slug == candidate else { return }
        availability = .unavailable(suggestion: suggestion)
      }
    } catch {
      guard slug == candidate else { return }
      availability = .failed
    }
  }

  func submit() async throws {
    guard canSubmit else { return }
    busy = true
    error = nil
    defer { busy = false }
    guard let resolved = try await WorkspaceSlugResolver.firstAvailable(base: slug, check: check) else {
      availability = .unavailable(suggestion: nil)
      error = String(localized: "That URL identifier is reserved or already in use. Enter a different one.")
      return
    }
    slug = resolved
    flags.onboardingPending = true
    do {
      try await create(trimmedName, resolved)
    } catch {
      flags.onboardingPending = false
      throw error
    }
  }
}
