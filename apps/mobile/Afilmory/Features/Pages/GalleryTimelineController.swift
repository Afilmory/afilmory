import UIKit

final class GalleryTimelineController: UIViewController, UITableViewDataSource, UITableViewDelegate {
  var onBrowseExploreHandler: () -> Void
  private let onOpenGallery: (GalleryHeaderModel, String?) -> Void
  private let tableView = UITableView(frame: .zero, style: .plain)
  private let refreshControl = UIRefreshControl()
  private var sections: [(day: String, events: [GalleryTimelineEvent])] = []

  init(
    onOpenGallery: @escaping (GalleryHeaderModel, String?) -> Void,
    onBrowseExplore: @escaping () -> Void
  ) {
    self.onOpenGallery = onOpenGallery
    onBrowseExploreHandler = onBrowseExplore
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    tableView.backgroundColor = .systemBackground
    tableView.separatorInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    tableView.dataSource = self
    tableView.delegate = self
    tableView.register(GalleryTimelineEventCell.self, forCellReuseIdentifier: GalleryTimelineEventCell.reuseIdentifier)
    refreshControl.addTarget(self, action: #selector(refresh), for: .valueChanged)
    tableView.refreshControl = refreshControl
    tableView.frame = view.bounds
    tableView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(tableView)
    reloadFromStore()
  }

  func reloadFromStore() {
    let store = GalleryTimelineStore.shared
    let grouped = Dictionary(grouping: store.events, by: \.day)
    sections = grouped.keys.sorted(by: >).map { day in
      (day, grouped[day]!.sorted { $0.latestAt > $1.latestAt })
    }
    tableView.reloadData()
    let kind = resolveTimelineEmptyKind(
      hasSubscriptions: GallerySubscriptionStore.shared.hasSubscriptions,
      eventCount: store.events.count,
      isLoading: store.isLoading,
      loadFailed: store.loadFailed
    )
    switch kind {
    case .none:
      if store.loadFailed, store.events.isEmpty {
        var configuration = UIContentUnavailableConfiguration.empty()
        configuration.image = UIImage(systemName: "exclamationmark.triangle")
        configuration.text = String(localized: "Failed to load photos")
        configuration.button = .filled()
        configuration.button.title = String(localized: "Retry")
        configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
          self?.refresh()
        }
        contentUnavailableConfiguration = configuration
      } else if store.isLoading, store.events.isEmpty {
        contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
      } else {
        contentUnavailableConfiguration = nil
      }
    case .noSubscriptions:
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.text = String(localized: "Subscribe to galleries to see new photos.")
      configuration.button = .filled()
      configuration.button.title = String(localized: "Browse galleries")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
        self?.onBrowseExploreHandler()
      }
      contentUnavailableConfiguration = configuration
    case .noRecentUpdates:
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.text = String(localized: "No recent updates")
      configuration.secondaryText = String(localized: "Followed galleries still appear under Following.")
      contentUnavailableConfiguration = configuration
    }
  }

  @objc private func refresh() {
    Task { @MainActor [weak self] in
      await GalleryTimelineStore.shared.refresh(timeZone: TimeZone.current.identifier)
      self?.reloadFromStore()
      self?.refreshControl.endRefreshing()
    }
  }

  func numberOfSections(in tableView: UITableView) -> Int {
    sections.count
  }

  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
    sections[section].events.count
  }

  func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
    Self.dayTitle(sections[section].day)
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    guard let cell = tableView.dequeueReusableCell(
      withIdentifier: GalleryTimelineEventCell.reuseIdentifier,
      for: indexPath
    ) as? GalleryTimelineEventCell else {
      return UITableViewCell()
    }
    let event = sections[indexPath.section].events[indexPath.row]
    cell.configure(event) { [weak self] photoID in
      self?.onOpenGallery(GalleryHeaderModel(timelineEvent: event), photoID)
    }
    return cell
  }

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    let event = sections[indexPath.section].events[indexPath.row]
    onOpenGallery(GalleryHeaderModel(timelineEvent: event), nil)
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let threshold = scrollView.contentSize.height - scrollView.bounds.height - 120
    guard scrollView.contentOffset.y > threshold, GalleryTimelineStore.shared.nextCursor != nil else { return }
    Task { @MainActor [weak self] in
      await GalleryTimelineStore.shared.loadMore(timeZone: TimeZone.current.identifier)
      self?.reloadFromStore()
    }
  }

  private static func dayTitle(_ day: String) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar.current
    formatter.locale = .current
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: day) else { return day }
    if Calendar.current.isDateInToday(date) {
      return String(localized: "Today")
    }
    if Calendar.current.isDateInYesterday(date) {
      return String(localized: "Yesterday")
    }
    formatter.dateStyle = .long
    formatter.timeStyle = .none
    formatter.dateFormat = nil
    return formatter.string(from: date)
  }
}

final class GalleryTimelineEventCell: UITableViewCell {
  static let reuseIdentifier = "GalleryTimelineEventCell"

  private let nameLabel = UILabel()
  private let timeLabel = UILabel()
  private let filmstrip = GalleryFilmstripView()
  private var onPhotoTap: ((String) -> Void)?

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    selectionStyle = .none
    nameLabel.font = .systemFont(ofSize: 16, weight: .semibold)
    timeLabel.font = .systemFont(ofSize: 12)
    timeLabel.textColor = .secondaryLabel
    let header = UIStackView(arrangedSubviews: [nameLabel, timeLabel])
    header.axis = .vertical
    header.spacing = 2
    header.translatesAutoresizingMaskIntoConstraints = false
    filmstrip.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(header)
    contentView.addSubview(filmstrip)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 12),
      header.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
      header.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
      filmstrip.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
      filmstrip.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
      filmstrip.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
      filmstrip.heightAnchor.constraint(equalToConstant: GalleryFilmstripView.itemHeight),
      filmstrip.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -14),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func configure(_ event: GalleryTimelineEvent, onPhotoTap: @escaping (String) -> Void) {
    self.onPhotoTap = onPhotoTap
    nameLabel.text = event.gallery.name
    timeLabel.text = Self.timeString(event.latestAt)
    filmstrip.configure(items: event.photos.map(GalleryFilmstripItem.init(preview:)), onSelect: onPhotoTap)
  }

  private static func timeString(_ iso: String) -> String {
    let parsed = ISO8601DateFormatter()
    parsed.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = parsed.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    return DateFormatter.localizedString(from: date, dateStyle: .none, timeStyle: .short)
  }
}
