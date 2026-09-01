import Foundation

struct GalleryRouteRequest: Decodable, Equatable, Sendable {
  let requestId: String
  let slug: String
  let title: String
  var photoID: String?
}

enum AfilmoryDeepLink: Equatable, Sendable {
  case root
  case photos
  case map
  case explore(GalleryRouteRequest?)
  case studio(StudioHomeRoute?)
  case developerLab

  private static let webHost = "afilmory.art"

  static func parse(
    _ url: URL,
    customScheme: String = AfilmoryBuildConfiguration.urlScheme
  ) -> AfilmoryDeepLink? {
    guard let scheme = url.scheme?.lowercased() else { return nil }
    let pathComponents: [String]
    let tenantSlug: String?
    if scheme == customScheme.lowercased() {
      tenantSlug = nil
      if let host = url.host?.trimmingToNil {
        pathComponents = [host] + url.pathComponents.filter { $0 != "/" }
      } else {
        pathComponents = url.pathComponents.filter { $0 != "/" }
      }
    } else if scheme == "https" || scheme == "http" {
      guard let host = url.host?.lowercased() else { return nil }
      if host == webHost {
        tenantSlug = nil
      } else if host.hasSuffix(".\(webHost)") {
        tenantSlug = webTenantSlug(fromHost: host)
      } else {
        return nil
      }
      pathComponents = url.pathComponents.filter { $0 != "/" }
    } else {
      return nil
    }

    guard let first = pathComponents.first?.lowercased() else {
      guard let tenantSlug else { return .root }
      return .explore(tenantRoute(slug: tenantSlug, photoID: nil))
    }
    switch first {
    case "photos":
      if pathComponents.count == 1 { return .photos }
      guard pathComponents.count == 2,
            let tenantSlug,
            let photoID = pathComponents[1].trimmingToNil
      else { return nil }
      return .explore(tenantRoute(slug: tenantSlug, photoID: photoID))
    case "photo":
      guard pathComponents.count == 3,
            let slug = pathComponents[1].trimmingToNil,
            let photoID = pathComponents[2].trimmingToNil
      else { return nil }
      return .explore(tenantRoute(slug: slug, photoID: photoID))
    case "map":
      return pathComponents.count == 1 ? .map : nil
    case "explore":
      guard pathComponents.count == 1 else { return nil }
      return .explore(galleryRoute(from: url))
    case "studio":
      guard pathComponents.count <= 2 else { return nil }
      if pathComponents.count == 1 {
        return .studio(nil)
      }
      let rawValue = "/studio/\(pathComponents[1].lowercased())"
      return StudioHomeRoute(rawValue: rawValue).map(AfilmoryDeepLink.studio)
    case "dev":
      #if DEBUG
        return pathComponents.count == 1 ? .developerLab : nil
      #else
        return nil
      #endif
    default:
      return nil
    }
  }

  private static func webTenantSlug(fromHost host: String) -> String? {
    let prefix = String(host.dropLast(webHost.count + 1))
    guard !prefix.isEmpty, !prefix.contains("."), prefix != "www" else { return nil }
    return prefix
  }

  private static func tenantRoute(slug: String, photoID: String?) -> GalleryRouteRequest {
    GalleryRouteRequest(
      requestId: UUID().uuidString,
      slug: slug,
      title: slug,
      photoID: photoID
    )
  }

  private static func galleryRoute(from url: URL) -> GalleryRouteRequest? {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
    let query = Dictionary(
      (components.queryItems ?? []).compactMap { item in
        item.value.map { (item.name, $0) }
      },
      uniquingKeysWith: { first, _ in first }
    )
    guard let slug = query["gallery"]?.trimmingToNil else { return nil }
    return GalleryRouteRequest(
      requestId: query["event"]?.trimmingToNil ?? "route:\(slug)",
      slug: slug,
      title: query["name"]?.trimmingToNil ?? slug
    )
  }
}

func galleryNotificationDeepLink(
  userInfo: [AnyHashable: Any],
  scheme: String = AfilmoryBuildConfiguration.urlScheme
) -> URL? {
  guard userInfo["route"] as? String == "gallery",
        let rawSlug = userInfo["gallerySlug"] as? String,
        let slug = rawSlug.trimmingToNil
  else { return nil }

  let galleryName = (userInfo["galleryName"] as? String)?.trimmingToNil ?? slug
  let eventId = (userInfo["eventId"] as? String)?.trimmingToNil ?? UUID().uuidString
  guard var components = URLComponents(string: "\(scheme):///explore") else { return nil }
  components.queryItems = [
    URLQueryItem(name: "gallery", value: slug),
    URLQueryItem(name: "name", value: galleryName),
    URLQueryItem(name: "event", value: eventId),
  ]
  return components.url
}
