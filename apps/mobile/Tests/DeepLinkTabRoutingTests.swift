@testable import Afilmory
import XCTest

final class DeepLinkTabRoutingTests: XCTestCase {
  func testEveryDeepLinkLandsOnItsTab() {
    let route = GalleryRouteRequest(requestId: "r", slug: "innei", title: "Innei", photoID: nil)
    let expectations: [(AfilmoryDeepLink, AppTab)] = [
      (.root, .exhibition),
      (.photos, .exhibition),
      (.map, .exhibition),
      (.explore(nil), .viewing),
      (.explore(route), .viewing),
      (.studio(nil), .darkroom),
      (.studio(.site), .darkroom),
      (.developerLab, .darkroom),
    ]
    for (link, tab) in expectations {
      XCTAssertEqual(DeepLinkTabRouting.tab(for: link), tab, "\(link)")
    }
  }

  func testTabOrderMatchesSpec() {
    XCTAssertEqual(AppTab.allCases, [.exhibition, .viewing, .darkroom])
    XCTAssertEqual(AppTab.allCases.map(\.rawValue), [0, 1, 2])
  }
}
