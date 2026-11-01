#if DEBUG
  import Foundation

  enum FixtureBackend {
    static func respond(to request: URLRequest, body: Data?, scenario: FixtureScenario) -> FixtureResponse {
      let fixtureRequest = FixtureRequest(
        request: request,
        body: body,
        scenario: scenario,
        state: FixtureState.shared(for: scenario)
      )
      if fixtureRequest.isMedia {
        return media(fixtureRequest)
      }
      let routes: [(FixtureRequest) -> FixtureResponse?] = [
        FixtureSessionRoutes.respond,
        FixtureGalleryRoutes.respond,
        FixtureManifestRoutes.respond,
        FixtureCommentRoutes.respond,
        FixtureStudioRoutes.respond,
        FixtureBillingRoutes.respond,
      ]
      for route in routes {
        if let response = route(fixtureRequest) {
          return response
        }
      }
      return .notFound(request.url?.path ?? "")
    }

    static func resetState() {
      FixtureState.resetAll()
    }

    private static func media(_ request: FixtureRequest) -> FixtureResponse {
      let name = request.segments.dropFirst().joined(separator: "/")
      guard !name.contains(".."),
            let url = FixtureCatalog.mediaFile(named: name),
            let data = try? Data(contentsOf: url)
      else { return .notFound("/media/\(name)") }
      let type = switch (name as NSString).pathExtension.lowercased() {
      case "jpg", "jpeg": "image/jpeg"
      case "png": "image/png"
      case "mov": "video/quicktime"
      default: "application/octet-stream"
      }
      return FixtureResponse(
        status: 200,
        headers: ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "max-age=31536000"],
        body: data
      )
    }
  }
#endif
