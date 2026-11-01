#if DEBUG
  import Foundation

  enum FixtureDomainRoutes {
    static let cnameTarget = "cname.afilmory.art"
    static let customDomainLimit = 1

    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      let state = request.state
      if request.match("GET", "tenant/domains") != nil {
        return FixtureReply.json(listing(state.read(\.domains)))
      }
      if request.match("POST", "tenant/domains") != nil {
        let host = (request.string("domain") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !host.isEmpty, host.contains(".") else {
          return FixtureReply.error(400, "Enter a valid domain", code: "VALIDATION_ERROR")
        }
        let result = state.mutate { data -> Result<FixtureDomain, FixtureResponseError> in
          if let existing = data.domains.first(where: { $0.domain == host }) {
            return .success(existing)
          }
          guard data.domains.count < customDomainLimit else {
            return .failure(FixtureResponseError(current: data.domains.count))
          }
          let domain = FixtureDomain(
            id: "domain-\(host.replacingOccurrences(of: ".", with: "-"))",
            domain: host,
            status: "pending",
            createdAt: Date(),
            verifiedAt: nil
          )
          data.domains.append(domain)
          return .success(domain)
        }
        switch result {
        case .success(let domain):
          return FixtureReply.json(["cnameTarget": cnameTarget, "domain": record(domain)])
        case .failure(let error):
          return FixtureReply.error(
            403,
            "Your plan allows \(customDomainLimit) custom domain.",
            code: "QUOTA_EXCEEDED",
            details: ["reason": "custom_domain", "current": error.current, "limit": customDomainLimit]
          )
        }
      }
      if let captures = request.match("POST", "tenant/domains/:id/verify") {
        let verified = state.mutate { data -> FixtureDomain? in
          guard let index = data.domains.firstIndex(where: { $0.id == captures[0] }) else { return nil }
          data.domains[index].status = "verified"
          data.domains[index].verifiedAt = Date()
          return data.domains[index]
        }
        guard let verified else { return FixtureReply.error(404, "Domain not found", code: "NOT_FOUND") }
        return FixtureReply.json(["cnameTarget": cnameTarget, "domain": record(verified)])
      }
      if let captures = request.match("DELETE", "tenant/domains/:id") {
        let deleted = state.mutate { data -> Bool in
          let before = data.domains.count
          data.domains.removeAll { $0.id == captures[0] }
          return before != data.domains.count
        }
        return deleted ? FixtureReply.json(["deleted": true]) : FixtureReply.error(404, "Domain not found", code: "NOT_FOUND")
      }
      return nil
    }

    static func listing(_ domains: [FixtureDomain]) -> [String: Any] {
      ["cnameTarget": cnameTarget, "customDomainLimit": customDomainLimit, "domains": domains.map(record)]
    }

    static func record(_ domain: FixtureDomain) -> [String: Any] {
      let verified = domain.status == "verified"
      return [
        "id": domain.id,
        "tenantId": FixtureCatalog.ownTenantId,
        "domain": domain.domain,
        "status": domain.status,
        "cloudflareHostnameId": "cf-hostname-\(domain.id)",
        "hostnameStatus": verified ? "active" : "pending",
        "sslStatus": verified ? "active" : "pending_validation",
        "verificationErrors": verified ? [String]() : ["CNAME record not found yet"],
        "lastSyncedAt": FixtureClock.iso(Date()),
        "verifiedAt": orNull(domain.verifiedAt.map(FixtureClock.iso)),
        "createdAt": FixtureClock.iso(domain.createdAt),
        "updatedAt": FixtureClock.iso(domain.verifiedAt ?? domain.createdAt),
      ]
    }
  }

  struct FixtureResponseError: Error {
    let current: Int
  }

  enum FixtureBillingRoutes {
    private static let storageCapacity: Double = 2 * 1024 * 1024 * 1024
    private static let libraryLimit: Double = 20
    private static let monthlyLimit: Double = 50

    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      guard request.segments.first == "billing" else { return nil }
      if let denied = FixtureManifestRoutes.ownerGuard(request) { return denied }
      if request.match("GET", "billing/overview") != nil {
        return FixtureReply.json(overview(request.state.read { $0 }))
      }
      if request.match("GET", "billing/app-store/offers") != nil {
        return FixtureReply.json(["configured": true, "offers": offers])
      }
      if request.match("POST", "billing/app-store/purchase-context") != nil {
        let offerId = request.string("offerId") ?? ""
        guard let offer = offers.first(where: { $0["id"] as? String == offerId }) else {
          return FixtureReply.error(404, "Offer not found", code: "NOT_FOUND")
        }
        return FixtureReply.json([
          "appAccountToken": "6F0A3D5E-2C1B-4B7A-9E8D-1A2B3C4D5E6F",
          "environment": "Sandbox",
          "offer": offer,
          "productId": offer["externalProductId"] ?? "",
        ])
      }
      if request.match("POST", "billing/app-store/transactions") != nil {
        return FixtureReply.json(["applied": true, "environment": "Sandbox", "status": "active", "transactionId": "2000000123456789"])
      }
      if request.match("POST", "billing/app-store/restore") != nil {
        return FixtureReply.json(["restored": 0, "results": [Any]()])
      }
      return nil
    }

    static func overview(_ data: FixtureStateData) -> [String: Any] {
      let photos = FixtureLibrary.ownPhotos(data)
      let usedBytes = photos.reduce(0) { $0 + $1.size }
      let thisMonth = photos.filter { Calendar.current.isDate($0.uploadedAt, equalTo: Date(), toGranularity: .month) }.count
      func dimension(_ reason: String, _ unit: String, used: Double, limit: Double, warns: Bool = true) -> [String: Any] {
        ["reason": reason, "unit": unit, "used": used, "limit": limit, "nearingLimit": warns && limit > 0 && used / limit >= 0.85]
      }
      return [
        "applicationPlan": ["id": "starter", "name": "Starter"],
        "storagePlan": ["id": "managed-2gb", "name": "Managed 2 GB", "capacityBytes": storageCapacity],
        "managedStorageEnabled": true,
        "subscriptionProvider": "app_store",
        "dimensions": [
          dimension("library_items", "items", used: Double(photos.count), limit: libraryLimit),
          dimension("monthly_process", "photos", used: Double(thisMonth), limit: monthlyLimit),
          dimension("storage", "bytes", used: usedBytes, limit: storageCapacity),
          dimension(
            "custom_domain", "domains",
            used: Double(data.domains.count), limit: Double(FixtureDomainRoutes.customDomainLimit), warns: false
          ),
        ],
      ]
    }

    static var offers: [[String: Any]] {
      [
        [
          "id": "offer-pro-monthly",
          "name": "Pro",
          "description": "5,000 photos, 50 GB managed storage, 3 custom domains.",
          "externalProductId": "app.afilmory.pro.monthly",
          "applicationPlanId": "pro",
          "storagePlanId": "managed-50gb",
          "storageCapacityBytes": 50 * 1024 * 1024 * 1024 as Int64,
          "rank": 1,
        ],
        [
          "id": "offer-studio-monthly",
          "name": "Studio",
          "description": "Unlimited photos, 500 GB managed storage, 10 custom domains.",
          "externalProductId": "app.afilmory.studio.monthly",
          "applicationPlanId": "studio",
          "storagePlanId": "managed-500gb",
          "storageCapacityBytes": 500 * 1024 * 1024 * 1024 as Int64,
          "rank": 2,
        ],
      ]
    }
  }
#endif
