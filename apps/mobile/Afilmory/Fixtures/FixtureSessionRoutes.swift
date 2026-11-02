#if DEBUG
  import Foundation

  enum FixtureSessionRoutes {
    private static let takenSlugs: Set<String> = ["innei", "birdline", "mayflowers", "nightwalker", "shanyuren", "harbor", "stilllife", "admin", "api"]

    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      let state = request.state
      if request.match("GET", "auth/session") != nil {
        return FixtureReply.json(state.read(\.signedIn) ? session(hasWorkspace: state.read(\.hasWorkspace)) : signedOut)
      }
      if request.match("POST", "auth/sign-in/email") != nil {
        guard request.string("password") != "wrong" else {
          return FixtureReply.error(401, "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD")
        }
        return signIn(request)
      }
      if request.match("POST", "auth/one-time-token/verify") != nil {
        return signIn(request)
      }
      if request.match("POST", "auth/sign-in/social") != nil {
        guard request.string("provider") == "apple" else {
          return FixtureReply.error(400, "Social sign-in needs a network connection. Use email sign-in in fixture mode.")
        }
        return signIn(request)
      }
      if request.match("POST", "mobile-auth/apple/exchange") != nil {
        return FixtureReply.json(["success": true])
      }
      if request.match("GET", "mobile-auth/apple/configuration") != nil {
        return FixtureReply.json(["appBundleIdentifier": "app.afilmory", "enabled": false, "webEnabled": false])
      }
      if request.match("POST", "auth/sign-out") != nil {
        state.mutate { $0.signedIn = false }
        return FixtureReply.json(["success": true])
      }
      if request.match("POST", "tenant/check-slug") != nil {
        let slug = (request.string("slug") ?? "").lowercased()
        guard !slug.isEmpty, !takenSlugs.contains(slug) else {
          return FixtureReply.error(409, "This gallery address is already taken.", code: "SLUG_TAKEN")
        }
        return FixtureReply.json(["slug": slug])
      }
      if request.match("POST", "auth/sign-up/email") != nil {
        state.mutate { $0.hasWorkspace = true }
        let tenant = request.body["tenant"] as? [String: Any]
        return FixtureReply.json(
          ["tenant": ["id": FixtureCatalog.ownTenantId, "slug": tenant?["slug"] ?? FixtureCatalog.ownSlug, "name": tenant?["name"] ?? workspaceName]],
          headers: FixtureReply.sessionCookie(request.scenario)
        )
      }
      if request.match("POST", "auth/workspaces/switch") != nil {
        guard state.read(\.signedIn) else { return FixtureReply.unauthorized }
        return FixtureReply.json(["activeWorkspace": workspace])
      }
      if request.match("GET", "account-deletion/impact") != nil {
        guard state.read(\.signedIn) else { return FixtureReply.unauthorized }
        return FixtureReply.json(deletionImpact)
      }
      if request.match("POST", "account-deletion/request") != nil {
        guard state.read(\.signedIn) else { return FixtureReply.unauthorized }
        state.mutate { $0.signedIn = false }
        return FixtureReply.json([
          "requestId": "deletion-request-0001",
          "status": "pending",
          "statusToken": "fixture-deletion-status-token",
        ])
      }
      if request.match("PUT", "push-devices") != nil {
        guard state.read(\.signedIn) else { return FixtureReply.unauthorized }
        return FixtureReply.json(["registered": true])
      }
      if request.match("DELETE", "push-devices") != nil {
        return FixtureReply.json(["registered": false])
      }
      return nil
    }

    private static func signIn(_ request: FixtureRequest) -> FixtureResponse {
      request.state.mutate { $0.signedIn = true }
      return FixtureReply.json(
        ["redirect": false, "token": "fixture-token", "user": user],
        headers: FixtureReply.sessionCookie(request.scenario)
      )
    }

    static let workspaceName = "Innei's Afilmory"

    static var user: [String: Any] {
      let owner = FixtureCatalog.shared.owner
      return [
        "id": owner.id,
        "name": owner.name,
        "email": "innei@example.com",
        "image": orNull(owner.avatarURL),
        "role": "user",
      ]
    }

    static var workspace: [String: Any] {
      [
        "id": FixtureCatalog.ownTenantId,
        "slug": FixtureCatalog.ownSlug,
        "name": workspaceName,
        "status": "active",
        "isPlaceholder": false,
      ]
    }

    static func session(hasWorkspace: Bool = true) -> [String: Any] {
      let active: Any = hasWorkspace ? workspace : NSNull()
      let memberships: [Any] = hasWorkspace
        ? [["id": "membership-innei", "role": "owner", "status": "active", "workspace": workspace] as [String: Any]]
        : []
      return [
        "user": user,
        "activeWorkspace": active,
        "requestedWorkspace": NSNull(),
        "requestedMembership": NSNull(),
        "memberships": memberships,
      ]
    }

    static var signedOut: [String: Any] {
      ["user": NSNull(), "activeWorkspace": NSNull(), "memberships": [Any]()]
    }

    private static var deletionImpact: [String: Any] {
      [
        "joinedWorkspaces": [Any](),
        "proofMethods": ["recent-session", "password"],
        "subscriptions": [
          ["id": "billing-sub-innei", "status": "active", "subscriptionId": "app-store-2000000123456789", "tenantId": FixtureCatalog.ownTenantId],
        ],
        "workspaces": [
          [
            "action": "delete",
            "name": workspaceName,
            "slug": FixtureCatalog.ownSlug,
            "tenantId": FixtureCatalog.ownTenantId,
            "transferTo": NSNull(),
          ],
        ],
      ]
    }
  }
#endif
