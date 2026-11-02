import Foundation

struct IntroPage: Equatable {
  let number: Int
  let imageName: String
  let kicker: String
  let title: String
  let body: String

  static var all: [IntroPage] {
    [
      IntroPage(
        number: 1,
        imageName: "Intro1",
        kicker: String(localized: "Exhibition"),
        title: String(localized: "Turn your photos into an exhibition"),
        body: String(localized: "Contact sheets cut by the day you shot them, at your own address. No layout work, and anyone can visit.")
      ),
      IntroPage(
        number: 2,
        imageName: "Intro2",
        kicker: String(localized: "Viewing"),
        title: String(localized: "Walk through other galleries"),
        body: String(localized: "Follow photographers you like and see their new rolls as soon as they're developed.")
      ),
      IntroPage(
        number: 3,
        imageName: "Intro3",
        kicker: String(localized: "Darkroom"),
        title: String(localized: "Develop straight from your phone"),
        body: String(localized: "Pick, review, develop. EXIF and places are filed for you.")
      ),
      IntroPage(
        number: 4,
        imageName: "Intro4",
        kicker: "Afilmory",
        title: String(localized: "Open a gallery of your own"),
        body: String(localized: "After signing in, name your gallery and develop your first roll.")
      ),
    ]
  }
}

struct IntroFlow {
  let flags: OnboardingFlags
  let count = IntroPage.all.count
  private(set) var index = 0

  init(flags: OnboardingFlags) {
    self.flags = flags
  }

  var isSignInPage: Bool { index == count - 1 }

  mutating func advance() {
    guard index < count - 1 else { return }
    index += 1
    if isSignInPage { flags.introSeen = true }
  }

  mutating func skip() {
    index = count - 1
    flags.introSeen = true
  }

  mutating func back() {
    index = max(0, index - 1)
  }
}
