#if DEBUG
  import Foundation

  struct FixtureComment {
    var id: String
    var slug: String
    var photoId: String
    var parentId: String?
    var userId: String
    var content: String
    var status: String
    var createdAt: Date
    var likes: Int
    var viewerLiked: Bool
  }

  struct FixtureDomain {
    var id: String
    var domain: String
    var status: String
    var createdAt: Date
    var verifiedAt: Date?
  }

  struct FixtureConflict {
    var id: String
    var storageKey: String
    var photoId: String?
    var reason: String
    var updatedAt: Date
  }

  struct FixtureSyncRun {
    var id: String
    var dryRun: Bool
    var startedAt: Date
    var completedAt: Date
    var updated: Int
    var conflicts: Int
  }

  struct FixtureStateData {
    var signedIn: Bool
    var hasWorkspace = !UserDefaults.standard.bool(forKey: "fixture.setup")
    var hasLibrary: Bool
    var subscriptions: [(tenantId: String, createdAt: Date)]
    var comments: [FixtureComment]
    var commentSequence = 0
    var photoReactions: [String: [String: Int]] = [:]
    var tagOverrides: [String: [String]] = [:]
    var deletedPhotoIds: Set<String> = []
    var revision = 42
    var changes: [[String: Any]] = []
    var siteValues: [String: String]
    var domains: [FixtureDomain]
    var conflicts: [FixtureConflict]
    var lastSyncRun: FixtureSyncRun?
  }

  final class FixtureState: @unchecked Sendable {
    private static let registry = FixtureStateRegistry()

    private let lock = NSLock()
    private var data: FixtureStateData

    init(scenario: FixtureScenario) {
      data = FixtureSeed.data(for: scenario)
    }

    static func shared(for scenario: FixtureScenario) -> FixtureState {
      registry.state(for: scenario)
    }

    static func resetAll() {
      registry.reset()
    }

    func read<T>(_ body: (FixtureStateData) -> T) -> T {
      lock.lock()
      defer { lock.unlock() }
      return body(data)
    }

    func mutate<T>(_ body: (inout FixtureStateData) -> T) -> T {
      lock.lock()
      defer { lock.unlock() }
      return body(&data)
    }
  }

  private final class FixtureStateRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var states: [FixtureScenario: FixtureState] = [:]

    func state(for scenario: FixtureScenario) -> FixtureState {
      lock.lock()
      defer { lock.unlock() }
      if let state = states[scenario] {
        return state
      }
      let state = FixtureState(scenario: scenario)
      states[scenario] = state
      return state
    }

    func reset() {
      lock.lock()
      states.removeAll()
      lock.unlock()
    }
  }

  enum FixtureSeed {
    static func data(for scenario: FixtureScenario) -> FixtureStateData {
      let catalog = FixtureCatalog.shared
      let epoch = catalog.epoch
      let isEmpty = scenario == .empty
      let follows: [String] = switch scenario {
      case .owner, .offline: ["tenant-nightwalker", "tenant-birdline", "tenant-mayflowers"]
      case .newcomer, .empty, .visitor: []
      }
      return FixtureStateData(
        signedIn: scenario != .visitor,
        hasLibrary: !isEmpty,
        subscriptions: follows.enumerated().map { index, tenantId in
          (tenantId, FixtureClock.ago(days: 20 + Double(index) * 11, from: epoch))
        },
        comments: isEmpty ? [] : comments(epoch: epoch),
        siteValues: siteValues(isEmpty: isEmpty),
        domains: isEmpty ? [] : [
          FixtureDomain(
            id: "domain-innei-gallery",
            domain: "gallery.innei.example",
            status: "verified",
            createdAt: FixtureClock.ago(days: 64, from: epoch),
            verifiedAt: FixtureClock.ago(days: 63.8, from: epoch)
          ),
        ],
        conflicts: isEmpty ? [] : [
          FixtureConflict(
            id: "conflict-dscf0420",
            storageKey: "photos/DSCF0420.jpg",
            photoId: "DSCF0420",
            reason: "Storage object changed after the last sync",
            updatedAt: FixtureClock.ago(hours: 30, from: epoch)
          ),
        ],
        lastSyncRun: isEmpty ? nil : FixtureSyncRun(
          id: "sync-run-0042",
          dryRun: false,
          startedAt: FixtureClock.ago(hours: 30.1, from: epoch),
          completedAt: FixtureClock.ago(hours: 30, from: epoch),
          updated: 2,
          conflicts: 1
        )
      )
    }

    private static func siteValues(isEmpty: Bool) -> [String: String] {
      FixtureSiteSchema.defaultValues.merging([
        "site.name": isEmpty ? "New Gallery" : "Innei's Afilmory",
        "site.title": isEmpty ? "New Gallery" : "Innei · Photos",
        "site.description": isEmpty ? "" : "Birds, cities and the quiet hours in between. 记录光影与生活。",
        "site.url": isEmpty ? "https://innei.afilmory.art" : "https://gallery.innei.example",
        "site.accentColor": "#E8A15C",
        "site.social.twitter": isEmpty ? "" : "https://x.com/innei",
        "site.social.github": isEmpty ? "" : "https://github.com/Innei",
      ]) { _, new in new }
    }

    private static func comments(epoch: Date) -> [FixtureComment] {
      func comment(
        _ id: String, _ slug: String, _ photoId: String, _ userId: String, _ content: String,
        status: String = "approved", hoursAgo: Double, likes: Int = 0, parentId: String? = nil
      ) -> FixtureComment {
        FixtureComment(
          id: id, slug: slug, photoId: photoId, parentId: parentId, userId: userId, content: content,
          status: status, createdAt: FixtureClock.ago(hours: hoursAgo, from: epoch), likes: likes, viewerLiked: false
        )
      }
      let own = FixtureCatalog.ownSlug
      return [
        comment("comment-robin-lin", own, "DSC_7132", "user-lin", "旅鸫的眼神好锐利，600mm 真的是神器。", hoursAgo: 52, likes: 4),
        comment(
          "comment-robin-reply", own, "DSC_7132", "user-innei", "谢谢！那天早上运气很好，它在枝头停了快一分钟。",
          hoursAgo: 49, likes: 2, parentId: "comment-robin-lin"
        ),
        comment("comment-robin-noah", own, "DSC_7132", "user-noah", "The light on the feathers is unreal. Patient work.", hoursAgo: 30, likes: 1),
        comment("comment-robin-xia", own, "DSC_7132", "user-xia", "求问这张的后期参数？色调很喜欢 🙏", status: "pending", hoursAgo: 5),
        comment("comment-bloom-mori", own, "DSCF2850", "user-mori", "Fuji colours at their finest.", hoursAgo: 80, likes: 3),
        comment("comment-bloom-yun", own, "DSCF2850", "user-yun", "五月的光线太温柔了，想打印一张挂在家里。", status: "pending", hoursAgo: 3),
        comment("comment-live-kai", own, "IMG_5484", "user-kai", "Is this from the Tokyo trip? Would love to see more from that night.", status: "pending", hoursAgo: 1.5),
        comment("comment-swallow-lin", own, "DSC_5710", "user-lin", "家燕飞行中还能对上焦，太强了。", hoursAgo: 120, likes: 6),
        comment("comment-old-hidden", own, "IMG_0030", "user-noah", "check my profile for cheap presets!!!", status: "hidden", hoursAgo: 300),
        comment("comment-birdline-xia", "birdline", "birdline-DSC_7132", "user-xia", "这只旅鸫好可爱！", hoursAgo: 20, likes: 2),
        comment("comment-birdline-innei", "birdline", "birdline-DSC_7132", "user-innei", "Same bird, different morning 😄", hoursAgo: 18, likes: 1),
        comment("comment-night-noah", "nightwalker", "nightwalker-IMG_20251111_002156", "user-noah", "Rainy neon never gets old.", hoursAgo: 2, likes: 1),
      ]
    }
  }
#endif
