import Combine
import UIKit

final class DarkroomController: UIViewController {
  let onRequestSignIn: () -> Void
  let model = DarkroomHomeModel()
  let stageView = DarkroomStageView()
  let statsView = DarkroomStatsView()
  let quotaStack = UIStackView()
  let adminNote = AFLabel.ui(String(localized: "Uploading and management are available to an active workspace administrator."), size: 14, color: AFColor.textSecondary)
  let loadErrorNote = AFLabel.mono(String(localized: "Couldn't reach your gallery. Pull down to try again."), size: 11, color: AFColor.destructive)
  let avatarButton = DarkroomAvatarButton()
  private let barAvatarButton = DarkroomAvatarButton()
  let rows = DarkroomRows()
  private let scrollView = UIScrollView()
  private let content = UIStackView()
  private lazy var header = DarkroomHeaderBar.root(title: String(localized: "Darkroom"), accessory: avatarButton)
  private var navigationDelegate: DarkroomNavigationDelegate?
  lazy var uploadFlow = DarkroomUploadFlow(host: self) { [weak self] in self?.model.libraryTags ?? [] }
  var jobs: [UploadJobState] = []
  var uploadToken: UUID?
  var wasRunning = false
  var clearedStaleJobs = false
  var cancellables: Set<AnyCancellable> = []
  var sponsorship: SponsorshipStore?
  var cacheBytes: UInt?
  var pendingRoute: StudioHomeRoute?
  #if DEBUG
    var debugQuotaWarnings: [BillingOverview.QuotaDimension]?
  #endif

  init(onRequestSignIn: @escaping () -> Void) {
    self.onRequestSignIn = onRequestSignIn
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    MainActor.assumeIsolated {
      if let uploadToken { UploadCenter.shared.unobserve(uploadToken) }
    }
  }

  override func viewIsAppearing(_ animated: Bool) {
    super.viewIsAppearing(animated)
    applyVerticalBar()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    overrideUserInterfaceStyle = .dark
    buildLayout()
    wireActions()
    if let navigationController {
      navigationDelegate = DarkroomNavigationDelegate(navigation: navigationController)
    }
    model.onChange = { [weak self] in self?.render() }
    model.onError = { [weak self] message in self?.showAlert(title: String(localized: "Unable to switch workspace"), message: message) }
    model.start()
    observeUploads()
    observeAccountStores()
    barAvatarButton.addAction(UIAction { [weak self] _ in self?.presentAccountSheet() }, for: .primaryActionTriggered)
    DuoBarItems.observe(self) { $0.applyVerticalBar() }
    render()
    applyVerticalBar()
  }

  func applyVerticalBar() {
    let context = traitCollection.duoContext
    avatarButton.isHidden = context.hasVerticalBar
    let items = context.hasVerticalBar && !context.isFlat
      ? [DuoBarItems.custom(barAvatarButton, label: String(localized: "Account"))]
      : []
    DuoBarItems.install(items, on: self)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    refreshCacheSize()
    applyFocusAccent()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if let route = pendingRoute {
      pendingRoute = nil
      push(route, animated: false)
    }
  }

  func open(route: StudioHomeRoute?) {
    guard let route else { return }
    guard isViewLoaded, view.window != nil else {
      pendingRoute = route
      return
    }
    push(route, animated: false)
  }

  private func buildLayout() {
    scrollView.alwaysBounceVertical = true
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.refreshControl = UIRefreshControl(frame: .zero, primaryAction: UIAction { [weak self] _ in
      self?.model.reload()
      self?.refreshCacheSize()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self?.scrollView.refreshControl?.endRefreshing() }
    })
    scrollView.refreshControl?.tintColor = AFColor.textTertiary
    view.addSubview(scrollView)
    view.addSubview(header)
    content.axis = .vertical
    content.spacing = 14
    content.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(content)
    quotaStack.axis = .vertical
    quotaStack.spacing = 10
    adminNote.numberOfLines = 0
    adminNote.textAlignment = .center
    let manageLabel = DarkroomGroupView.sectionLabel(String(localized: "Manage"))
    let accountLabel = DarkroomGroupView.sectionLabel(String(localized: "Account"))
    rows.manageLabel = manageLabel
    loadErrorNote.numberOfLines = 0
    loadErrorNote.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for: AFFont.mono(size: 11))
    for item in [stageView, quotaStack, loadErrorNote, statsView, adminNote, manageLabel, rows.manageGroup, accountLabel, rows.accountGroup] as [UIView] {
      content.addArrangedSubview(item)
    }
    content.setCustomSpacing(30, after: statsView)
    content.setCustomSpacing(30, after: adminNote)
    content.setCustomSpacing(10, after: manageLabel)
    content.setCustomSpacing(30, after: rows.manageGroup)
    content.setCustomSpacing(10, after: accountLabel)
    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: view.topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      content.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: DarkroomHeaderBar.contentHeight + 12),
      content.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16),
      content.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16),
      content.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
    ])
    scrollView.verticalScrollIndicatorInsets.top = DarkroomHeaderBar.contentHeight
  }

  func render() {
    let session = model.session
    avatarButton.configure(user: session?.user)
    barAvatarButton.configure(user: session?.user)
    let canManage = model.canManage
    stageView.isHidden = !canManage
    statsView.isHidden = !canManage
    rows.manageLabel?.isHidden = !canManage
    rows.manageGroup.isHidden = !canManage
    adminNote.isHidden = canManage || session == nil
    loadErrorNote.isHidden = !canManage || model.loadError == nil
    statsView.apply(model.stats)
    rows.library.detail = model.stats.map { NativeStudioFormatters.count($0.frames) }
    rows.replies.detail = model.pendingComments.map { DarkroomStats.pendingRepliesDetail(count: $0.count, hasMore: $0.hasMore) }
    rows.domain.detail = model.customDomain
    rows.workspace.detail = session?.activeWorkspace?.name
    rows.workspace.isBusy = model.switchingWorkspaceID != nil
    rows.workspace.menu = workspaceMenu()
    rows.plan.detail = EntitlementStore.shared.snapshot?.applicationPlan.name
    rows.plan.isHidden = !EntitlementStore.shared.isAvailable
    rows.cache.detail = cacheBytes.map { Int64($0).formatted(.byteCount(style: .file)) }
    renderSponsorship()
    renderQuota()
    rows.manageGroup.refreshSeparators()
    rows.accountGroup.refreshSeparators()
    renderStage(animated: false)
  }

  func renderStage(animated: Bool) {
    let stage = DarkroomStage(jobs: jobs, interaction: uploadFlow.interaction)
    stageView.apply(stage: stage, jobs: jobs.filter { $0.status != .cancelled }, animated: animated && view.window != nil)
  }

  func push(_ route: StudioHomeRoute, animated: Bool) {
    guard let navigationController else { return }
    if let top = navigationController.topViewController as? DarkroomSubpageController, top.route == route { return }
    navigationController.popToRootViewController(animated: false)
    navigationController.pushViewController(makeSubpage(route), animated: animated)
  }

  func makeSubpage(_ route: StudioHomeRoute, librarySelecting: Bool = false) -> UIViewController {
    switch route {
    case .library:
      DarkroomSubpageController(title: String(localized: "Library"), route: route, content: DarkroomLibraryController(startsSelecting: librarySelecting))
    case .comments:
      DarkroomSubpageController(title: String(localized: "Replies"), route: route, swiftUI: StudioCommentsView())
    case .analytics:
      DarkroomSubpageController(title: String(localized: "Data"), route: route, swiftUI: StudioAnalyticsView())
    case .operations:
      DarkroomSubpageController(title: String(localized: "Sync"), route: route, swiftUI: StudioOperationsView())
    case .site:
      DarkroomSubpageController(title: String(localized: "Site"), route: route, swiftUI: StudioSiteView())
    case .domain:
      DarkroomSubpageController(title: String(localized: "Domain"), route: route, swiftUI: StudioDomainView())
    }
  }

  func showAlert(title: String, message: String) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }
}
