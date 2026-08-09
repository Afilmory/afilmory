import UIKit

enum StudioHomeRoute: String, CaseIterable, Sendable {
  case analytics = "/studio/analytics"
  case comments = "/studio/comments"
  case library = "/studio/library"
  case operations = "/studio/operations"
  case site = "/studio/site"
}

enum StudioPhotoSyncStatus: String, Decodable, Sendable {
  case conflict
  case pending
  case synced
}

struct StudioDashboardSyncStats: Decodable, Sendable {
  let pending: Int
  let conflicts: Int
}

struct StudioDashboardStats: Decodable, Sendable {
  let totalPhotos: Int
  let totalStorageBytes: Int64
  let thisMonthUploads: Int
  let sync: StudioDashboardSyncStats
}

struct StudioRecentActivity: Decodable, Sendable {
  let id: String
  let title: String
  let createdAt: String
  let storageProvider: String
  let syncStatus: StudioPhotoSyncStatus
}

struct StudioDashboardOverview: Decodable, Sendable {
  let stats: StudioDashboardStats
  let recentActivity: [StudioRecentActivity]
}

struct StudioPendingComment: Decodable, Sendable {
  let id: String
}

struct StudioPendingCommentsPage: Decodable, Sendable {
  let comments: [StudioPendingComment]
  let nextCursor: String?
}

struct StudioDataSyncRun: Decodable, Sendable {
  let completedAt: String
}

struct StudioDataSyncStatus: Decodable, Sendable {
  let lastRun: StudioDataSyncRun?
}

struct StudioHomeSnapshot: Sendable {
  let overview: StudioDashboardOverview
  let pendingComments: Int
  let pendingCommentsHasMore: Bool
  let syncStatus: StudioDataSyncStatus
}

private struct StudioWorkspaceSwitchBody: Encodable {
  let tenantId: String
}

private struct StudioWorkspaceSwitchResponse: Decodable {
  let activeWorkspace: AfilmorySessionWorkspace
}

private enum StudioHomeFormatter {
  static func count(_ value: Int, localeIdentifier: String) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.numberStyle = .decimal
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }

  static func bytes(_ value: Int64, localeIdentifier: String) -> String {
    guard value > 0 else { return "0 B" }
    let units = ["B", "KB", "MB", "GB", "TB"]
    var amount = Double(value)
    var unitIndex = 0
    while amount >= 1024, unitIndex < units.count - 1 {
      amount /= 1024
      unitIndex += 1
    }

    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = amount >= 10 ? 1 : 2
    formatter.minimumFractionDigits = 0
    let formatted =
      formatter.string(from: NSNumber(value: amount)) ?? String(format: "%.1f", amount)
    return "\(formatted) \(units[unitIndex])"
  }

  static func dateTime(_ value: String?, localeIdentifier: String) -> String? {
    guard let value, let date = try? Date(value, strategy: .iso8601) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter.string(from: date)
  }
}

final class StudioHomeController: UITableViewController {
  private struct Section {
    let title: String?
    let rows: [Row]
  }

  private enum Row {
    case activity(StudioRecentActivity)
    case labeled(title: String, value: String)
    case navigation(
      title: String,
      detail: String,
      symbol: String,
      badge: String?,
      route: StudioHomeRoute
    )
    case signOut
    case workspace(id: String, name: String)
  }

  private let onNavigate: (StudioHomeRoute) -> Void
  private let onRequestSignIn: () -> Void
  private let onRequestSignOut: () -> Void
  private let onWorkspaceChanged: (String) -> Void
  private var currentSession: AfilmorySession?
  private var sections: [Section] = []
  private var sessionObservation: AfilmorySessionObservationToken?
  private var loadTask: Task<Void, Never>?
  private var workspaceSwitchTask: Task<Void, Never>?
  private var snapshot: StudioHomeSnapshot?
  private var activeWorkspaceID: String?
  private var switchingWorkspaceID: String?
  private var hasAppeared = false

  init(
    onRequestSignIn: @escaping () -> Void,
    onRequestSignOut: @escaping () -> Void,
    onNavigate: @escaping (StudioHomeRoute) -> Void,
    onWorkspaceChanged: @escaping (String) -> Void
  ) {
    self.onRequestSignIn = onRequestSignIn
    self.onRequestSignOut = onRequestSignOut
    self.onNavigate = onNavigate
    self.onWorkspaceChanged = onWorkspaceChanged
    super.init(style: .insetGrouped)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    loadTask?.cancel()
    workspaceSwitchTask?.cancel()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = String(localized: "Studio")
    navigationItem.largeTitleDisplayMode = .always
    navigationController?.navigationBar.prefersLargeTitles = true
    tableView.backgroundColor = .systemGroupedBackground
    tableView.cellLayoutMarginsFollowReadableWidth = true
    tableView.keyboardDismissMode = .interactive
    tableView.rowHeight = UITableView.automaticDimension
    tableView.estimatedRowHeight = 56

    let refreshControl = UIRefreshControl()
    refreshControl.addAction(UIAction { [weak self] _ in self?.loadStudio() }, for: .valueChanged)
    self.refreshControl = refreshControl

    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    AfilmorySessionStore.shared.bootstrap()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    if hasAppeared, snapshot != nil, currentSession != nil {
      loadStudio()
    }
    hasAppeared = true
  }

  override func numberOfSections(in tableView: UITableView) -> Int {
    sections.count
  }

  override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
    sections[section].rows.count
  }

  override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String?
  {
    sections[section].title
  }

  override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath)
    -> UITableViewCell
  {
    let row = sections[indexPath.section].rows[indexPath.row]
    let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
    cell.selectionStyle = isRowEnabled(row) ? .default : .none

    switch row {
    case .labeled(let title, let value):
      var content = UIListContentConfiguration.valueCell()
      content.text = title
      content.secondaryText = value
      content.secondaryTextProperties.font = .preferredFont(forTextStyle: .body)
      cell.contentConfiguration = content

    case .workspace(let id, let name):
      var content = UIListContentConfiguration.cell()
      content.image = UIImage(systemName: "arrow.left.arrow.right.circle")
      content.imageProperties.tintColor = .tintColor
      content.text = name
      cell.contentConfiguration = content
      if switchingWorkspaceID == id {
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.startAnimating()
        cell.accessoryView = indicator
      }

    case .navigation(let title, let detail, let symbol, let badge, _):
      var content = UIListContentConfiguration.subtitleCell()
      content.image = UIImage(systemName: symbol)
      content.imageProperties.tintColor = .tintColor
      content.imageProperties.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
        pointSize: 18)
      content.text = title
      content.textProperties.font = .preferredFont(forTextStyle: .body)
      content.secondaryText = detail
      content.secondaryTextProperties.color = .secondaryLabel
      content.secondaryTextProperties.font = .preferredFont(forTextStyle: .caption1)
      cell.contentConfiguration = content
      if let badge {
        let badgeLabel = UILabel()
        badgeLabel.font = .preferredFont(forTextStyle: .body)
        badgeLabel.text = badge
        badgeLabel.textColor = .secondaryLabel
        let chevron = UIImageView(image: UIImage(systemName: "chevron.right"))
        chevron.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
          pointSize: 12, weight: .semibold)
        chevron.tintColor = .tertiaryLabel
        let accessory = UIStackView(arrangedSubviews: [badgeLabel, chevron])
        accessory.alignment = .center
        accessory.spacing = 8
        cell.accessoryView = accessory
      } else {
        cell.accessoryType = .disclosureIndicator
      }

    case .activity(let activity):
      var content = UIListContentConfiguration.subtitleCell()
      content.image = UIImage(systemName: activitySymbol(activity.syncStatus))
      content.imageProperties.tintColor = activityColor(activity.syncStatus)
      content.imageProperties.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
        pointSize: 17)
      content.text = activity.title
      content.textProperties.font = .preferredFont(forTextStyle: .body)
      content.secondaryText =
        StudioHomeFormatter.dateTime(
          activity.createdAt,
          localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier
        ) ?? activity.storageProvider
      content.secondaryTextProperties.color = .secondaryLabel
      content.secondaryTextProperties.font = .preferredFont(forTextStyle: .caption1)
      cell.contentConfiguration = content
      cell.selectionStyle = .none

    case .signOut:
      var content = UIListContentConfiguration.cell()
      content.text = String(localized: "Sign out")
      content.textProperties.color = .systemRed
      content.textProperties.alignment = .center
      cell.contentConfiguration = content
    }
    return cell
  }

  override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    defer { tableView.deselectRow(at: indexPath, animated: true) }
    let row = sections[indexPath.section].rows[indexPath.row]
    guard isRowEnabled(row) else { return }
    switch row {
    case .navigation(_, _, _, _, let route):
      onNavigate(route)
    case .workspace(let id, _):
      switchWorkspace(id: id)
    case .signOut:
      onRequestSignOut()
      AfilmorySessionStore.shared.clearSession()
    case .activity, .labeled:
      break
    }
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .loading:
      if snapshot == nil {
        showLoading()
      }

    case .signedOut:
      resetContent()
      showAccess(
        title: String(localized: "Sign in to Studio"),
        description: String(localized: "Sign in with the administrator account for your workspace."),
        image: "lock",
        action: String(localized: "Sign in"),
        handler: onRequestSignIn
      )

    case .failed(let message):
      resetContent()
      showError(message: message)

    case .signedIn(let session):
      let canManage =
        session.activeMembership.map {
          $0.status == "active" && ($0.role == "admin" || $0.role == "owner")
        } ?? false
      guard canManage,
        let workspace = session.activeWorkspace,
        workspace.status == "active"
      else {
        resetContent()
        showAccess(
          title: String(localized: "Administrator access required"),
          description: String(localized: "Studio is available to an active workspace administrator."),
          image: "person.badge.shield.checkmark",
          action: nil,
          handler: nil
        )
        return
      }

      let changedWorkspace = activeWorkspaceID != workspace.id
      activeWorkspaceID = workspace.id
      currentSession = session
      switchingWorkspaceID = nil
      ApiEnvironmentStore.shared.activateTenant(slug: workspace.slug)
      if changedWorkspace {
        snapshot = nil
      }
      loadStudio()
    }
  }

  private func loadStudio() {
    guard currentSession != nil, let workspaceID = activeWorkspaceID else {
      refreshControl?.endRefreshing()
      return
    }
    loadTask?.cancel()
    if snapshot == nil {
      showLoading()
    }

    loadTask = Task { [weak self] in
      guard let self else { return }
      do {
        async let overview: StudioDashboardOverview = AfilmoryAPI.shared.request(
          APIEndpoint(
            baseURL: .tenant,
            path: "dashboard/overview",
            retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
          )
        )
        async let comments: StudioPendingCommentsPage = AfilmoryAPI.shared.request(
          APIEndpoint(
            baseURL: .tenant,
            path: "comments/all",
            queryItems: [
              URLQueryItem(name: "limit", value: "20"),
              URLQueryItem(name: "status", value: "pending"),
            ],
            retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
          )
        )
        async let syncStatus: StudioDataSyncStatus = AfilmoryAPI.shared.request(
          APIEndpoint(
            baseURL: .tenant,
            path: "data-sync/status",
            retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
          )
        )

        let (resolvedOverview, resolvedComments, resolvedSyncStatus) = try await (
          overview,
          comments,
          syncStatus
        )
        try Task.checkCancellation()
        guard activeWorkspaceID == workspaceID else { return }
        snapshot = StudioHomeSnapshot(
          overview: resolvedOverview,
          pendingComments: resolvedComments.comments.count,
          pendingCommentsHasMore: resolvedComments.nextCursor != nil,
          syncStatus: resolvedSyncStatus
        )
        renderSections()
      } catch is CancellationError {
        return
      } catch APIError.cancelled {
        return
      } catch {
        guard activeWorkspaceID == workspaceID else { return }
        if snapshot == nil {
          showError(message: error.localizedDescription)
        } else {
          presentError(message: error.localizedDescription)
        }
      }
      refreshControl?.endRefreshing()
    }
  }

  private func renderSections() {
    guard let session = currentSession,
      let workspace = session.activeWorkspace,
      let snapshot
    else { return }
    let localeIdentifier = PhotoDateLanguage.activeLocaleIdentifier
    let count: (Int) -> String = {
      StudioHomeFormatter.count($0, localeIdentifier: localeIdentifier)
    }
    let pendingComments =
      snapshot.pendingCommentsHasMore
      ? "\(count(snapshot.pendingComments))+"
      : count(snapshot.pendingComments)
    let manageableMemberships = session.memberships.filter {
      $0.status == "active"
        && $0.workspace.status == "active"
        && ($0.role == "admin" || $0.role == "owner")
        && $0.workspace.id != workspace.id
    }

    var workspaceRows: [Row] = [
      .labeled(title: String(localized: "Name"), value: workspace.name),
      .labeled(title: String(localized: "Signed in as"), value: session.user.email),
    ]
    workspaceRows.append(
      contentsOf: manageableMemberships.map {
        .workspace(id: $0.workspace.id, name: $0.workspace.name)
      })

    let stats = snapshot.overview.stats
    let lastSync =
      StudioHomeFormatter.dateTime(
        snapshot.syncStatus.lastRun?.completedAt,
        localeIdentifier: localeIdentifier
      ) ?? String(localized: "No sync has completed yet")
    let conflictsBadge = stats.sync.conflicts > 0 ? count(stats.sync.conflicts) : nil

    var nextSections: [Section] = [
      Section(title: String(localized: "Workspace"), rows: workspaceRows),
      Section(
        title: String(localized: "Overview"),
        rows: [
          .labeled(
            title: String(localized: "Photos"), value: count(stats.totalPhotos)),
          .labeled(
            title: String(localized: "Storage"),
            value: StudioHomeFormatter.bytes(
              stats.totalStorageBytes, localeIdentifier: localeIdentifier)
          ),
          .labeled(
            title: String(localized: "Uploads this month"),
            value: count(stats.thisMonthUploads)),
          .labeled(
            title: String(localized: "Pending comments"), value: pendingComments),
        ]
      ),
      Section(
        title: String(localized: "Manage"),
        rows: [
          .navigation(
            title: String(localized: "Photo Library"),
            detail: String(localized: "Upload, tag, and remove photo assets"),
            symbol: "photo.on.rectangle.angled",
            badge: nil,
            route: .library
          ),
          .navigation(
            title: String(localized: "Comments"),
            detail: String(localized: "Review status and remove comments"),
            symbol: "text.bubble",
            badge: snapshot.pendingComments > 0 ? pendingComments : nil,
            route: .comments
          ),
          .navigation(
            title: String(localized: "Analytics"),
            detail: String(localized: "Uploads, storage, tags, and devices"),
            symbol: "chart.xyaxis.line",
            badge: nil,
            route: .analytics
          ),
          .navigation(
            title: String(localized: "Site Settings"),
            detail: String(localized: "Branding, social links, feed, and map"),
            symbol: "paintpalette",
            badge: nil,
            route: .site
          ),
        ]
      ),
      Section(
        title: String(localized: "Operations"),
        rows: [
          .navigation(
            title: String(localized: "Data sync"),
            detail: lastSync,
            symbol: "arrow.triangle.2.circlepath",
            badge: conflictsBadge,
            route: .operations
          ),
          .labeled(
            title: String(localized: "Pending sync"), value: count(stats.sync.pending)
          ),
          .labeled(
            title: String(localized: "Conflicts"), value: count(stats.sync.conflicts)
          ),
        ]
      ),
    ]

    let recentActivity = Array(snapshot.overview.recentActivity.prefix(4))
    if !recentActivity.isEmpty {
      nextSections.append(
        Section(
          title: String(localized: "Recent activity"),
          rows: recentActivity.map(Row.activity)
        )
      )
    }
    nextSections.append(Section(title: nil, rows: [.signOut]))

    sections = nextSections
    contentUnavailableConfiguration = nil
    tableView.reloadData()
    refreshControl?.endRefreshing()
  }

  private func switchWorkspace(id: String) {
    guard switchingWorkspaceID == nil, id != activeWorkspaceID else { return }
    switchingWorkspaceID = id
    tableView.reloadData()
    workspaceSwitchTask?.cancel()
    workspaceSwitchTask = Task { [weak self] in
      guard let self else { return }
      do {
        let endpoint = APIEndpoint(
          baseURL: .platform,
          path: "auth/workspaces/switch",
          method: .post,
          body: try APIEndpoint.jsonBody(StudioWorkspaceSwitchBody(tenantId: id))
        )
        let response: StudioWorkspaceSwitchResponse = try await AfilmoryAPI.shared.request(endpoint)
        ApiEnvironmentStore.shared.activateTenant(slug: response.activeWorkspace.slug)
        onWorkspaceChanged(response.activeWorkspace.slug)
        AfilmorySessionStore.shared.refreshSession()
      } catch is CancellationError {
        return
      } catch APIError.cancelled {
        return
      } catch {
        switchingWorkspaceID = nil
        tableView.reloadData()
        presentError(message: error.localizedDescription)
      }
    }
  }

  private func isRowEnabled(_ row: Row) -> Bool {
    switch row {
    case .navigation, .signOut:
      true
    case .workspace:
      switchingWorkspaceID == nil
    case .activity, .labeled:
      false
    }
  }

  private func activitySymbol(_ status: StudioPhotoSyncStatus) -> String {
    switch status {
    case .synced:
      "checkmark.circle.fill"
    case .pending:
      "clock.fill"
    case .conflict:
      "exclamationmark.triangle.fill"
    }
  }

  private func activityColor(_ status: StudioPhotoSyncStatus) -> UIColor {
    switch status {
    case .synced:
      .systemGreen
    case .pending:
      .systemOrange
    case .conflict:
      .systemRed
    }
  }

  private func resetContent() {
    loadTask?.cancel()
    workspaceSwitchTask?.cancel()
    currentSession = nil
    activeWorkspaceID = nil
    switchingWorkspaceID = nil
    snapshot = nil
    sections = []
    refreshControl?.endRefreshing()
    tableView.reloadData()
  }

  private func showLoading() {
    sections = []
    tableView.reloadData()
    contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
  }

  private func showAccess(
    title: String,
    description: String,
    image: String,
    action: String?,
    handler: (() -> Void)?
  ) {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: image)
    configuration.text = title
    configuration.secondaryText = description
    if let action, let handler {
      configuration.button = .filled()
      configuration.button.title = action
      configuration.buttonProperties.primaryAction = UIAction { _ in handler() }
    }
    contentUnavailableConfiguration = configuration
  }

  private func showError(message: String) {
    sections = []
    tableView.reloadData()
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "exclamationmark.triangle")
    configuration.text = String(localized: "Unable to load Studio")
    configuration.secondaryText =
      message.isEmpty
      ? String(localized: "Check your connection and try again.")
      : message
    configuration.button = .filled()
    configuration.button.title = String(localized: "Retry")
    configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
      if self?.currentSession == nil {
        AfilmorySessionStore.shared.refreshSession()
      } else {
        self?.loadStudio()
      }
    }
    contentUnavailableConfiguration = configuration
    refreshControl?.endRefreshing()
  }

  private func presentError(message: String) {
    guard presentedViewController == nil else { return }
    let alert = UIAlertController(
      title: String(localized: "Unable to load Studio"),
      message: message.isEmpty ? String(localized: "Check your connection and try again.") : message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }
}
