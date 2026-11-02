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
  let primaryColumn = UIStackView()
  private let secondaryColumn = UIStackView()
  let stageRow = DarkroomRowButton(symbol: "camera.aperture", title: String(localized: "Stage"))
  let accountCard = DarkroomAccountCard()
  var flatSelection: StudioHomeRoute?
  var flatDetail: UIViewController?
  private lazy var stageGroup = DarkroomGroupView(rows: [stageRow])
  private lazy var secondaryWidth = secondaryColumn.widthAnchor.constraint(equalToConstant: 0)
  private var homeLayoutKey = ""
  private var flatSidebarMaxX: CGFloat = 0
  private var contentLeading: NSLayoutConstraint?
  private var contentTrailing: NSLayoutConstraint?
  private lazy var primaryWidth = primaryColumn.widthAnchor.constraint(equalToConstant: 0)
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
    DuoBarItems.observe(self) { $0.duoPostureChanged() }
    navigationController?.registerForTraitChanges([DuoContextTrait.self]) { [weak self] (_: UINavigationController, _: UITraitCollection) in
      self?.duoPostureChanged()
    }
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
    for column in [primaryColumn, secondaryColumn] {
      column.axis = .vertical
      column.spacing = 14
      content.addArrangedSubview(column)
    }
    for item in [stageView, quotaStack, loadErrorNote, statsView, adminNote] as [UIView] {
      primaryColumn.addArrangedSubview(item)
    }
    for item in [accountCard, stageGroup, manageLabel, rows.manageGroup, accountLabel, rows.accountGroup] as [UIView] {
      secondaryColumn.addArrangedSubview(item)
    }
    accountCard.isHidden = true
    stageGroup.isHidden = true
    secondaryColumn.setCustomSpacing(18, after: accountCard)
    secondaryColumn.setCustomSpacing(24, after: stageGroup)
    stageRow.addAction(UIAction { [weak self] _ in self?.selectFlat(nil) }, for: .primaryActionTriggered)
    accountCard.addAction(UIAction { [weak self] _ in self?.presentAccountSheet() }, for: .primaryActionTriggered)
    primaryColumn.setCustomSpacing(30, after: statsView)
    content.setCustomSpacing(30, after: primaryColumn)
    secondaryColumn.setCustomSpacing(10, after: manageLabel)
    secondaryColumn.setCustomSpacing(30, after: rows.manageGroup)
    secondaryColumn.setCustomSpacing(10, after: accountLabel)
    let leading = content.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16)
    let trailing = content.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16)
    contentLeading = leading
    contentTrailing = trailing
    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: view.topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      content.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: DarkroomHeaderBar.contentHeight + 12),
      leading,
      trailing,
      content.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
    ])
    scrollView.verticalScrollIndicatorInsets.top = DarkroomHeaderBar.contentHeight
  }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    applyHomeLayout()
  }


  private func applyHomeLayout() {
    let safe = view.safeAreaInsets
    let rect = CGRect(x: safe.left, y: 0, width: max(0, view.bounds.width - safe.left - safe.right), height: view.bounds.height)
    let context = traitCollection.duoContext
    let pages = DuoGeometry.lanes(in: rect, context: context, view: view)
    let key = "\(pages)|\(context.isFlat)|\(view.bounds.width)"
    guard key != homeLayoutKey else { return }
    homeLayoutKey = key
    accountCard.isHidden = !context.isFlat
    stageGroup.isHidden = !context.isFlat
    secondaryWidth.isActive = false
    if context.isFlat {
      let gap: CGFloat = 28
      let sidebar = ((rect.width - 32 - gap) / 3).rounded()
      content.insertArrangedSubview(secondaryColumn, at: 0)
      content.axis = .horizontal
      content.alignment = .top
      content.setCustomSpacing(gap, after: secondaryColumn)
      contentLeading?.constant = rect.minX + 16
      contentTrailing?.constant = -(view.bounds.width - rect.maxX + 16)
      primaryWidth.isActive = false
      secondaryWidth.constant = sidebar
      secondaryWidth.isActive = true
      flatSidebarMaxX = rect.minX + 16 + sidebar
    } else if pages.count == 2 {
      content.insertArrangedSubview(primaryColumn, at: 0)
      let gap = pages[1].minX - pages[0].maxX + 32
      content.axis = .horizontal
      content.alignment = .top
      content.setCustomSpacing(gap, after: primaryColumn)
      contentLeading?.constant = pages[0].minX + 16
      contentTrailing?.constant = -(view.bounds.width - pages[1].maxX + 16)
      primaryWidth.constant = pages[0].width - 32
      primaryWidth.isActive = true
    } else {
      content.insertArrangedSubview(primaryColumn, at: 0)
      primaryWidth.isActive = false
      content.axis = .vertical
      content.alignment = .fill
      content.setCustomSpacing(30, after: primaryColumn)
      contentLeading?.constant = 16 + safe.left
      contentTrailing?.constant = -(16 + safe.right)
    }
    content.updateConstraintsIfNeeded()
    updateFlatSelection()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if traitCollection.duoContext.isFlat {
      layoutFlatDetail(sidebarMaxX: flatSidebarMaxX)
    }
  }

  func render() {
    let session = model.session
    avatarButton.configure(user: session?.user)
    barAvatarButton.configure(user: session?.user)
    accountCard.configure(session: session)
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
    if duoContext.isFlat {
      selectFlat(route)
      return
    }
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
