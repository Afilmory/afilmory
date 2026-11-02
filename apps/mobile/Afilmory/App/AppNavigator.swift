import UIKit

@MainActor
protocol AppNavigating: AnyObject {
  var tabs: AfilmoryTabBarController? { get }
  func switchToTab(_ tab: AppTab, animated: Bool)
  func openGallery(_ route: GalleryRouteRequest, level: ContactSheetLevel)
  func openOwnExhibition(level: ContactSheetLevel, focusingPhotoID: String?)
  func openDarkroom(route: StudioHomeRoute?)
  func presentSignIn()
  func presentIntro()
  func presentAccountSettings(startsDeletion: Bool)
  func presentSubscription(focus: QuotaWallReason?)
  func signOut()
}

@MainActor
final class AppNavigator {
  static let shared = AppNavigator()

  weak var host: AppNavigating?

  var tabs: AfilmoryTabBarController? { host?.tabs }

  func switchToTab(_ tab: AppTab, animated: Bool = true) {
    host?.switchToTab(tab, animated: animated)
  }

  func setTabBarHidden(_ hidden: Bool, animated: Bool = true) {
    tabs?.setFocusBarHidden(hidden, animated: animated)
  }

  func setFocusAccent(_ color: UIColor) {
    tabs?.focusBar.accentColor = color
  }

  func openGallery(_ route: GalleryRouteRequest, level: ContactSheetLevel = .day) {
    host?.openGallery(route, level: level)
  }

  func openOwnExhibition(level: ContactSheetLevel, focusingPhotoID: String? = nil) {
    host?.openOwnExhibition(level: level, focusingPhotoID: focusingPhotoID)
  }

  func openDarkroom(route: StudioHomeRoute? = nil) {
    host?.openDarkroom(route: route)
  }

  func presentSignIn() {
    host?.presentSignIn()
  }

  func presentIntro() {
    host?.presentIntro()
  }

  func presentAccountSettings(startsDeletion: Bool = false) {
    host?.presentAccountSettings(startsDeletion: startsDeletion)
  }

  func presentSubscription(focus: QuotaWallReason? = nil) {
    host?.presentSubscription(focus: focus)
  }

  func signOut() {
    host?.signOut()
  }
}
