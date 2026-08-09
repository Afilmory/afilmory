import SDWebImage
import UIKit

private let minColumnCount = 1
private let maxColumnCount = 12
private let minItemWidth: CGFloat = 92
private let defaultPreferredItemWidth: CGFloat = 190
private let chromeEdgeInset: CGFloat = 12
private let chromeControlSize: CGFloat = 44
private let chromeControlGap: CGFloat = 12
private let chromeTopOffset: CGFloat = 8
private let chromeDateRightGap: CGFloat = 12
private let chromeDateFontSize: CGFloat = 17
private let chromeDateHorizontalInset: CGFloat = 16
private let dateAnchorIdleDelay: TimeInterval = 1.5
private let avatarImageSize: CGFloat = 34
private let filterBadgeSize: CGFloat = 16

private final class PassthroughOverlayView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hitView = super.hitTest(point, with: event)
    return hitView === self ? nil : hitView
  }
}

final class PhotoMasonryView: UIView {
  var onNativePhotoPress: ((Int) -> Void)?
  var onNativeVisibleRangeChange: ((Int, Int) -> Void)?
  var onNativeColumnCountChange: ((Int, CGFloat) -> Void)?
  var onNativeRefresh: (() -> Void)?
  var onNativeDatePress: ((UIView) -> Void)?
  var onNativeProfilePress: ((UIView) -> Void)?
  var onNativeFilterPress: ((UIView) -> Void)?
  var onNativeContextMenuAction: ((String, String) -> Void)?
  var onNativeSelectionChange: (([String]) -> Void)?
  var onNativeSelectionModeChange: ((Bool) -> Void)?
  var onNativeQueryHeaderEdit: ((UIView) -> Void)?
  var onNativeQueryHeaderClear: (() -> Void)?
  var onNativeQueryHeaderRemoveConstraint: ((PhotoQueryConstraint) -> Void)?

  var contextMenuInfoTitle = ""
  var contextMenuShareTitle = ""
  var contextMenuSelectTitle = ""

  var defaultColumnCount = 2 {
    didSet { applyInitialColumnCountIfNeeded() }
  }

  var preferredItemWidth = defaultPreferredItemWidth {
    didSet { applyPreferredItemWidthIfPossible() }
  }

  var gap: CGFloat = 4 {
    didSet {
      layout.gap = gap
      layout.invalidateLayout()
    }
  }

  var extraTopInset: CGFloat = 0 {
    didSet {
      updateInsets()
      setNeedsLayout()
    }
  }

  var extraBottomInset: CGFloat = 0 {
    didSet { updateInsets() }
  }

  var chromeVisible = false {
    didSet { updateChromeVisibility() }
  }

  var chromeIdentityLabel = "" {
    didSet { updateDateButton() }
  }

  var chromeDateLabel = "" {
    didSet { updateDateButton() }
  }

  // Secondary half of the pill (the resolved city). It is dropped whole rather than
  // truncated, so a narrow pill shows a complete date range instead of "range · ci…".
  var chromeDateDetail = "" {
    didSet { updateDateButton() }
  }

  var chromeDateVisible = false {
    didSet { updateDateVisibility(animated: window != nil) }
  }

  var chromeDateInteractive = false {
    didSet { updateDateInteraction() }
  }

  var profileImageURL = "" {
    didSet { updateProfile() }
  }

  var profileInitial = "?" {
    didSet { updateProfile() }
  }

  var profileAccessibilityLabel = "" {
    didSet { updateProfile() }
  }

  var filterActive = false {
    didSet {
      updateFilterButton()
      if filterActive {
        resetDateAnchor()
      } else {
        showsFilterSummary = false
      }
      updateDateButton()
    }
  }

  var filterAccessibilityLabel = "" {
    didSet { updateFilterButton() }
  }

  var filterCount = 0 {
    didSet { updateFilterButton() }
  }

  var queryHeaderModel: PhotoQueryHeaderModel? {
    didSet { updateQueryHeader(oldValue: oldValue) }
  }

  var livePhotoAccessibilityLabel = "Live Photo" {
    didSet {
      for case let cell as PhotoCell in collectionView.visibleCells {
        cell.setLivePhotoAccessibilityLabel(livePhotoAccessibilityLabel)
      }
    }
  }

  var selectionEnabled = false {
    didSet {
      if !selectionEnabled {
        setSelectionMode(false)
      }
    }
  }

  private var photos: [MasonryPhoto] = []
  private var boundFeedKey: PhotoFeedKey?
  private var boundFeed: PhotoFeed?
  private var feedObservation: PhotoFeedObservationToken?
  private var filterObservation: PhotoFeedObservationToken?
  private var appliesFilters = false
  private var layout = MasonryLayout()
  private var collectionView: UICollectionView!
  private let refreshControl = UIRefreshControl()
  private let haptics = UIImpactFeedbackGenerator(style: .light)
  private let overlayView = PassthroughOverlayView()
  private let dateButton = UIButton()
  private let profileButton = UIButton()
  private let profileInitialLabel = UILabel()
  private let avatarImageView = UIImageView()
  private let filterButton = UIButton()
  private let filterBadge = UILabel()
  private let controlCluster = UIVisualEffectView()
  private let profileGlass = UIVisualEffectView()
  private let filterGlass = UIVisualEffectView()
  private let queryHeaderView = PhotoQueryHeaderView()

  private var columnCount = 2
  private var hasAppliedInitialColumnCount = false
  private var lastLayoutWidth: CGFloat = 0
  private var pinchStartPosition: CGFloat = 2
  private var pinchAnchorItem: Int?
  private var pinchAnchorViewportOffset: CGFloat = 0
  private var lastPinchDetent = 2
  private var settleGeneration = 0
  private var dateAvailableWidth: CGFloat = 0
  private var lastReportedRange = (start: -1, end: -1)
  private var lastVisibleRangeEmit: CFTimeInterval = 0
  private var selectionMode = false
  private var selectedPhotoIds = Set<String>()
  private var showsDateAnchor = false
  private var dateIdleTimer: Timer?
  private var lastUserScrollAt: CFTimeInterval = 0
  private var queryHeaderHeight: CGFloat = 0
  private var showsFilterSummary = false

  override init(frame: CGRect) {
    super.init(frame: frame)

    layout.zoomPosition = CGFloat(columnCount)
    layout.gap = gap

    collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
    collectionView.backgroundColor = .clear
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.prefetchDataSource = self
    collectionView.contentInsetAdjustmentBehavior = .always
    collectionView.showsVerticalScrollIndicator = false
    collectionView.alwaysBounceVertical = true
    if #available(iOS 26.0, *) {
      collectionView.topEdgeEffect.style = .soft
      let interaction = UIScrollEdgeElementContainerInteraction()
      interaction.scrollView = collectionView
      interaction.edge = .top
      overlayView.addInteraction(interaction)
    }
    collectionView.register(PhotoCell.self, forCellWithReuseIdentifier: PhotoCell.reuseIdentifier)
    collectionView.addSubview(queryHeaderView)
    queryHeaderView.isHidden = true
    queryHeaderView.onEdit = { [weak self, weak queryHeaderView] in
      guard let self, let queryHeaderView else { return }
      self.onNativeQueryHeaderEdit?(queryHeaderView)
    }
    queryHeaderView.onClear = { [weak self] in self?.onNativeQueryHeaderClear?() }
    queryHeaderView.onRemoveConstraint = { [weak self] constraint in
      self?.onNativeQueryHeaderRemoveConstraint?(constraint)
    }

    refreshControl.tintColor = .white
    refreshControl.addTarget(self, action: #selector(handleRefresh), for: .valueChanged)
    collectionView.refreshControl = refreshControl

    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    collectionView.addGestureRecognizer(pinch)

    addSubview(collectionView)
    addSubview(overlayView)

    configureChrome()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let widthChanged = lastLayoutWidth > 0 && abs(lastLayoutWidth - bounds.width) > 0.5
    let anchor = widthChanged ? captureViewportAnchor() : nil
    collectionView.frame = bounds
    overlayView.frame = bounds
    layoutQueryHeader()
    applyInitialColumnCountIfNeeded()
    if widthChanged {
      applyPreferredItemWidth(for: bounds.width)
      collectionView.layoutIfNeeded()
      restoreViewportAnchor(anchor)
    }
    lastLayoutWidth = bounds.width
    layoutChrome()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  // Registers the collection view as the screen's content scroll view so UIKit drives
  // tab bar minimization, scroll edge effects, and status-bar tap scroll-to-top (iOS 26).
  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else {
      dateIdleTimer?.invalidate()
      dateIdleTimer = nil
      return
    }
    var responder: UIResponder? = next
    while let current = responder {
      if let viewController = current as? UIViewController {
        viewController.setContentScrollView(collectionView, for: .all)
        break
      }
      responder = current.next
    }
  }

  func setPhotos(_ newPhotos: [MasonryPhoto]) {
    photos = newPhotos
    let availableIds = Set(newPhotos.map(\.id))
    let previousSelection = selectedPhotoIds
    selectedPhotoIds.formIntersection(availableIds)
    layout.aspectRatios = newPhotos.map { CGFloat($0.aspectRatio) }
    layout.invalidateLayout()
    collectionView.reloadData()
    lastReportedRange = (-1, -1)
    DispatchQueue.main.async { [weak self] in
      self?.emitVisibleRange()
    }
    if selectedPhotoIds != previousSelection {
      emitSelection()
    }
  }

  func setFeedKey(_ rawValue: String) {
    guard let key = PhotoFeedKey(rawValue: rawValue), key != boundFeedKey else { return }
    boundFeedKey = key
    let feed = PhotoFeedStore.shared.feed(for: key)
    boundFeed = feed
    feedObservation?.cancel()
    feedObservation = feed.observe { [weak self] in
      self?.renderBoundFeed()
    }
    configureFilterObservation()
    PhotoFeedStore.shared.load(key)
    renderBoundFeed()
  }

  func setAppliesFilters(_ applies: Bool) {
    guard appliesFilters != applies else { return }
    appliesFilters = applies
    configureFilterObservation()
    renderBoundFeed()
  }

  private func configureFilterObservation() {
    filterObservation?.cancel()
    filterObservation = appliesFilters
      ? PhotoFilterStore.shared.observe { [weak self] in self?.renderBoundFeed() }
      : nil
  }

  private func renderBoundFeed() {
    guard let boundFeed else { return }
    let galleryPhotos = appliesFilters
      ? PhotoFilterEngine.apply(PhotoFilterStore.shared.filters, to: boundFeed.photos)
      : boundFeed.photos
    setPhotos(galleryPhotos.map(MasonryPhoto.init(photo:)))
    setRefreshing(boundFeed.loadState == .loading && !boundFeed.photos.isEmpty)
  }

  func setSelectionMode(_ active: Bool) {
    guard !active || selectionEnabled else { return }
    guard selectionMode != active else { return }
    selectionMode = active
    if !active {
      selectedPhotoIds.removeAll()
      emitSelection()
    }
    updateVisibleSelectionState()
  }

  func setSelectedPhotoIds(_ ids: [String]) {
    let availableIds = Set(photos.map(\.id))
    let next = Set(ids).intersection(availableIds)
    guard next != selectedPhotoIds else { return }
    selectedPhotoIds = next
    updateVisibleSelectionState()
  }

  func setRefreshing(_ refreshing: Bool) {
    if !refreshing, refreshControl.isRefreshing {
      refreshControl.endRefreshing()
    }
  }

  func transitionSourceView(for photoId: String) -> UIView? {
    guard let index = photos.firstIndex(where: { $0.id == photoId }) else { return nil }
    let indexPath = IndexPath(item: index, section: 0)
    if let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell {
      return cell.transitionSourceView
    }

    collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: false)
    collectionView.layoutIfNeeded()
    return (collectionView.cellForItem(at: indexPath) as? PhotoCell)?.transitionSourceView
  }

  func visibleTransitionSourceView(for photoId: String) -> UIView? {
    guard let index = photos.firstIndex(where: { $0.id == photoId }) else { return nil }
    return (collectionView.cellForItem(at: IndexPath(item: index, section: 0)) as? PhotoCell)?
      .transitionSourceView
  }

  private func configureChrome() {
    dateButton.addTarget(self, action: #selector(handleDatePress), for: .touchUpInside)
    dateButton.accessibilityIdentifier = "photo-masonry-date"
    dateButton.alpha = 0
    dateButton.isHidden = true
    overlayView.addSubview(dateButton)

    // Apple's floating control clusters are a glass container holding individual glass
    // elements, which is what makes adjacent controls merge as they near each other and
    // deform under touch. Two standalone .glass() button configurations render neither.
    if #available(iOS 26.0, *) {
      let clusterEffect = UIGlassContainerEffect()
      clusterEffect.spacing = chromeControlGap
      controlCluster.effect = clusterEffect
    }
    overlayView.addSubview(controlCluster)

    for glass in [profileGlass, filterGlass] {
      // The glass element is the surface only; its own interactive behaviour would
      // swallow touches before they reach the button hosted in its content view.
      glass.effect = AdaptiveGlass.effect(
        interactive: true,
        fallbackStyle: .systemThinMaterialDark
      )
      glass.clipsToBounds = true
      glass.layer.cornerCurve = .circular
      controlCluster.contentView.addSubview(glass)
    }

    profileButton.addTarget(self, action: #selector(handleProfilePress), for: .touchUpInside)
    profileButton.accessibilityIdentifier = "photo-masonry-profile"
    profileButton.accessibilityLabel = profileAccessibilityLabel
    profileButton.configuration = makeControlConfiguration()
    profileGlass.contentView.addSubview(profileButton)

    profileInitialLabel.font = .systemFont(ofSize: 14, weight: .bold)
    profileInitialLabel.textAlignment = .center
    profileInitialLabel.textColor = .label
    profileInitialLabel.isUserInteractionEnabled = false
    profileButton.addSubview(profileInitialLabel)

    avatarImageView.clipsToBounds = true
    avatarImageView.contentMode = .scaleAspectFill
    avatarImageView.isUserInteractionEnabled = false
    profileButton.addSubview(avatarImageView)

    filterButton.addTarget(self, action: #selector(handleFilterPress), for: .touchUpInside)
    filterButton.accessibilityIdentifier = "photo-masonry-filters"
    filterGlass.contentView.addSubview(filterButton)

    filterBadge.backgroundColor = .systemBlue
    filterBadge.clipsToBounds = true
    filterBadge.font = .systemFont(ofSize: 10, weight: .bold)
    filterBadge.isAccessibilityElement = false
    filterBadge.textAlignment = .center
    filterBadge.textColor = .white
    overlayView.addSubview(filterBadge)

    updateDateButton()
    updateDateInteraction()
    updateProfile()
    updateFilterButton()
    updateChromeVisibility()
  }

  // The circular controls draw no background of their own — the glass element behind them
  // is the surface.
  private func makeControlConfiguration() -> UIButton.Configuration {
    var configuration = UIButton.Configuration.plain()
    configuration.background.backgroundColor = .clear
    configuration.baseForegroundColor = .white
    return configuration
  }

  private func makeChromeConfiguration(prominent: Bool = false) -> UIButton.Configuration {
    var configuration = AdaptiveGlass.buttonConfiguration(prominent: prominent)
    if prominent {
      // Prominent glass takes its fill from the tint, which would otherwise resolve to the
      // system accent. A neutral translucent black keeps it glass while giving the fixed
      // near-white title a floor to read against on bright photos.
      configuration.baseBackgroundColor = UIColor(white: 0, alpha: 0.4)
      configuration.baseForegroundColor = .white
    }
    configuration.buttonSize = .medium
    configuration.cornerStyle = .capsule
    return configuration
  }

  private func dateTitleWidth(_ title: String) -> CGFloat {
    let font = UIFont.systemFont(ofSize: chromeDateFontSize, weight: .semibold)
    let text = ceil((title as NSString).size(withAttributes: [.font: font]).width)
    return text + chromeDateHorizontalInset * 2
  }

  private func fittedDateTitle() -> String {
    guard !chromeDateLabel.isEmpty, !chromeDateDetail.isEmpty else { return chromeDateLabel }
    let combined = "\(chromeDateLabel) · \(chromeDateDetail)"
    return dateTitleWidth(combined) <= dateAvailableWidth ? combined : chromeDateLabel
  }

  private func isShowingDatePill() -> Bool {
    if filterActive {
      return queryHeaderHeight == 0 || showsFilterSummary
    }
    return showsDateAnchor && !chromeDateLabel.isEmpty
  }

  private func currentDateTitle() -> String {
    isShowingDatePill() ? fittedDateTitle() : chromeIdentityLabel
  }

  private func setDateAnchorActive(_ active: Bool) {
    guard showsDateAnchor != active else { return }
    showsDateAnchor = active

    guard window != nil, chromeVisible, chromeDateVisible else {
      updateDateButton()
      return
    }
    UIView.transition(
      with: dateButton,
      duration: 0.2,
      options: [.transitionCrossDissolve, .beginFromCurrentState, .allowUserInteraction],
      animations: { self.updateDateButton() }
    )
    UIView.animate(
      withDuration: 0.2,
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut],
      animations: { self.layoutChrome() }
    )
  }

  // Re-arms with the remaining time instead of resetting on every scroll callback,
  // which would allocate a fresh timer per frame while the finger is down.
  private func noteUserScroll() {
    guard !filterActive else { return }
    lastUserScrollAt = CACurrentMediaTime()
    setDateAnchorActive(true)
    if dateIdleTimer == nil {
      armDateIdleTimer(after: dateAnchorIdleDelay)
    }
  }

  private func armDateIdleTimer(after delay: TimeInterval) {
    dateIdleTimer = Timer.scheduledTimer(
      timeInterval: delay,
      target: self,
      selector: #selector(handleDateIdleTimer),
      userInfo: nil,
      repeats: false
    )
  }

  @objc private func handleDateIdleTimer() {
    dateIdleTimer = nil
    let elapsed = CACurrentMediaTime() - lastUserScrollAt
    if elapsed >= dateAnchorIdleDelay {
      setDateAnchorActive(false)
    } else {
      armDateIdleTimer(after: dateAnchorIdleDelay - elapsed)
    }
  }

  private func resetDateAnchor() {
    dateIdleTimer?.invalidate()
    dateIdleTimer = nil
    setDateAnchorActive(false)
  }

  private func updateDateButton() {
    let title = currentDateTitle()
    var configuration: UIButton.Configuration
    if isShowingDatePill() {
      configuration = makeChromeConfiguration(prominent: true)
    } else {
      configuration = .plain()
      configuration.baseForegroundColor = .white
    }
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: 0,
      leading: chromeDateHorizontalInset,
      bottom: 0,
      trailing: chromeDateHorizontalInset
    )
    configuration.title = title
    configuration.titleLineBreakMode = .byTruncatingTail
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = .systemFont(ofSize: chromeDateFontSize, weight: .semibold)
      return outgoing
    }
    dateButton.configuration = configuration
    dateButton.accessibilityLabel = title
    updateDateVisibility(animated: false)
    setNeedsLayout()
  }

  private func updateDateInteraction() {
    dateButton.isUserInteractionEnabled = chromeDateInteractive
    dateButton.accessibilityTraits = chromeDateInteractive ? .button : .staticText
  }

  private func updateDateVisibility(animated: Bool) {
    let shouldShow = chromeVisible && chromeDateVisible && !currentDateTitle().isEmpty
    let changes = {
      self.dateButton.alpha = shouldShow ? 1 : 0
      self.dateButton.transform = shouldShow ? .identity : CGAffineTransform(translationX: 0, y: -6)
    }

    if shouldShow {
      dateButton.isHidden = false
    }

    guard animated else {
      changes()
      dateButton.isHidden = !shouldShow
      return
    }

    UIView.animate(
      withDuration: shouldShow ? 0.2 : 0.15,
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut],
      animations: changes,
      completion: { [weak self] finished in
        if finished, !shouldShow {
          self?.dateButton.isHidden = true
        }
      }
    )
  }

  private func updateProfile() {
    let initial = profileInitial.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? "?"
    profileInitialLabel.text = initial.uppercased()
    profileButton.accessibilityLabel = profileAccessibilityLabel

    avatarImageView.sd_cancelCurrentImageLoad()
    avatarImageView.image = nil
    guard let url = URL(string: profileImageURL), !profileImageURL.isEmpty else {
      avatarImageView.isHidden = true
      return
    }

    avatarImageView.isHidden = false
    avatarImageView.sd_setImage(with: url, placeholderImage: nil, options: [.retryFailed])
  }

  private func updateFilterButton() {
    var configuration = makeControlConfiguration()
    configuration.contentInsets = .zero
    configuration.image = UIImage(systemName: "magnifyingglass")
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
    if filterActive {
      configuration.baseForegroundColor = .systemBlue
    }
    filterButton.configuration = configuration

    let count = max(filterCount, 0)
    filterBadge.text = String(count)
    filterBadge.isHidden = !chromeVisible || !filterActive || count == 0
    filterButton.accessibilityLabel = filterAccessibilityLabel
    filterButton.accessibilityTraits = filterActive ? [.button, .selected] : .button
  }

  private func updateQueryHeader(oldValue: PhotoQueryHeaderModel?) {
    guard oldValue != queryHeaderModel else { return }
    let previousHeight = queryHeaderHeight
    if let queryHeaderModel {
      queryHeaderView.configure(queryHeaderModel)
      queryHeaderView.isHidden = false
      queryHeaderHeight = PhotoQueryHeaderView.layoutMetrics(for: bounds.width).reservedHeight
    } else {
      queryHeaderView.isHidden = true
      queryHeaderHeight = 0
    }
    showsFilterSummary = false
    if previousHeight != queryHeaderHeight {
      updateInsets()
    }
    layoutQueryHeader()
    updateDateButton()
  }

  private func layoutQueryHeader() {
    guard queryHeaderHeight > 0 else {
      queryHeaderView.frame = .zero
      return
    }
    let metrics = PhotoQueryHeaderView.layoutMetrics(for: bounds.width)
    if queryHeaderHeight != metrics.reservedHeight {
      queryHeaderHeight = metrics.reservedHeight
      updateInsets()
    }
    queryHeaderView.frame = CGRect(
      x: metrics.horizontalInset,
      y: -queryHeaderHeight + metrics.topSpacing,
      width: max(bounds.width - metrics.horizontalInset * 2, 0),
      height: metrics.cardHeight
    )
  }

  private func updateFilterSummaryVisibility(offset: CGFloat, animated: Bool) {
    let revealThreshold = max(queryHeaderHeight - 72, 1)
    let shouldShow = filterActive && queryHeaderHeight > 0 && offset >= revealThreshold
    guard shouldShow != showsFilterSummary else { return }
    showsFilterSummary = shouldShow

    guard animated, window != nil, chromeVisible, chromeDateVisible else {
      updateDateButton()
      return
    }
    UIView.transition(
      with: dateButton,
      duration: 0.2,
      options: [.transitionCrossDissolve, .beginFromCurrentState, .allowUserInteraction],
      animations: { self.updateDateButton() }
    )
    UIView.animate(
      withDuration: 0.2,
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut],
      animations: { self.layoutChrome() }
    )
  }

  private func updateChromeVisibility() {
    controlCluster.isHidden = !chromeVisible
    profileButton.isHidden = !chromeVisible
    filterButton.isHidden = !chromeVisible
    if !chromeVisible {
      filterBadge.isHidden = true
    } else {
      updateFilterButton()
    }
    updateDateVisibility(animated: window != nil)
  }

  private func layoutChrome() {
    let controlY = safeAreaInsets.top + chromeTopOffset
    let filterX = bounds.width - chromeEdgeInset - chromeControlSize
    let profileX = filterX - chromeControlGap - chromeControlSize

    controlCluster.frame = CGRect(
      x: profileX,
      y: controlY,
      width: chromeControlSize * 2 + chromeControlGap,
      height: chromeControlSize
    )
    let circle = CGRect(x: 0, y: 0, width: chromeControlSize, height: chromeControlSize)
    profileGlass.frame = circle
    filterGlass.frame = circle.offsetBy(dx: chromeControlSize + chromeControlGap, dy: 0)
    profileGlass.layer.cornerRadius = chromeControlSize / 2
    filterGlass.layer.cornerRadius = chromeControlSize / 2
    profileButton.frame = profileGlass.contentView.bounds
    filterButton.frame = filterGlass.contentView.bounds

    let avatarInset = (chromeControlSize - avatarImageSize) / 2
    let avatarFrame = profileButton.bounds.insetBy(dx: avatarInset, dy: avatarInset)
    avatarImageView.frame = avatarFrame
    avatarImageView.layer.cornerRadius = avatarImageSize / 2
    profileInitialLabel.frame = avatarFrame

    let dateMaxWidth = max(profileX - chromeDateRightGap - chromeEdgeInset, 0)
    // Recomposing the title needs the width the pill actually gets, which only exists here.
    if dateMaxWidth != dateAvailableWidth {
      dateAvailableWidth = dateMaxWidth
      updateDateButton()
    }
    let fittingWidth = dateButton.sizeThatFits(
      CGSize(width: dateMaxWidth, height: chromeControlSize)
    ).width
    dateButton.frame = CGRect(
      x: chromeEdgeInset,
      y: controlY,
      width: min(fittingWidth, dateMaxWidth),
      height: chromeControlSize
    )

    // The badge stays in the overlay rather than the glass element, so it is not refracted
    // by the very surface it labels.
    filterBadge.frame = CGRect(
      x: filterX + chromeControlSize - filterBadgeSize + 4,
      y: controlY - 4,
      width: filterBadgeSize,
      height: filterBadgeSize
    )
    filterBadge.layer.cornerRadius = filterBadgeSize / 2
  }

  private struct ViewportAnchor {
    let item: Int
    let offset: CGFloat
  }

  private func maxAllowedColumnCount(for width: CGFloat) -> Int {
    guard width > 0 else { return 4 }
    let widthLimited = Int(floor((width + gap) / (minItemWidth + gap)))
    return min(maxColumnCount, max(4, widthLimited))
  }

  private func columnCount(forPreferredItemWidth width: CGFloat, containerWidth: CGFloat) -> Int {
    let preferred = max(width, minItemWidth)
    let rawCount = Int(((containerWidth + gap) / (preferred + gap)).rounded())
    return min(max(rawCount, minColumnCount), maxAllowedColumnCount(for: containerWidth))
  }

  private func applyInitialColumnCountIfNeeded() {
    guard !hasAppliedInitialColumnCount, bounds.width > 0 else { return }
    hasAppliedInitialColumnCount = true
    let clamped = preferredItemWidth > 0
      ? columnCount(forPreferredItemWidth: preferredItemWidth, containerWidth: bounds.width)
      : min(max(defaultColumnCount, minColumnCount), maxAllowedColumnCount(for: bounds.width))
    guard clamped != columnCount else { return }
    columnCount = clamped
    layout.zoomPosition = CGFloat(clamped)
    layout.invalidateLayout()
  }

  private func applyPreferredItemWidthIfPossible() {
    guard hasAppliedInitialColumnCount, bounds.width > 0, preferredItemWidth > 0 else { return }
    let anchor = captureViewportAnchor()
    applyPreferredItemWidth(for: bounds.width)
    collectionView.layoutIfNeeded()
    restoreViewportAnchor(anchor)
  }

  private func applyPreferredItemWidth(for width: CGFloat) {
    guard preferredItemWidth > 0 else { return }
    let next = columnCount(forPreferredItemWidth: preferredItemWidth, containerWidth: width)
    guard next != columnCount || layout.zoomPosition != CGFloat(next) else { return }
    columnCount = next
    layout.zoomPosition = CGFloat(next)
    layout.invalidateLayout()
  }

  private func captureViewportAnchor() -> ViewportAnchor? {
    let visible = collectionView.indexPathsForVisibleItems
    guard !visible.isEmpty else { return nil }
    let viewportTop = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    let anchorPath = visible.min { lhs, rhs in
      let lhsDistance = abs((layout.layoutAttributesForItem(at: lhs)?.frame.minY ?? 0) - viewportTop)
      let rhsDistance = abs((layout.layoutAttributesForItem(at: rhs)?.frame.minY ?? 0) - viewportTop)
      return lhsDistance < rhsDistance
    }
    guard let anchorPath, let frame = layout.layoutAttributesForItem(at: anchorPath)?.frame else { return nil }
    return ViewportAnchor(item: anchorPath.item, offset: frame.minY - collectionView.contentOffset.y)
  }

  private func restoreViewportAnchor(_ anchor: ViewportAnchor?) {
    guard let anchor,
          photos.indices.contains(anchor.item),
          let frame = layout.layoutAttributesForItem(at: IndexPath(item: anchor.item, section: 0))?.frame
    else { return }
    let minOffset = -collectionView.adjustedContentInset.top
    let maxOffset = max(
      minOffset,
      collectionView.contentSize.height + collectionView.adjustedContentInset.bottom - collectionView.bounds.height
    )
    collectionView.contentOffset.y = min(max(frame.minY - anchor.offset, minOffset), maxOffset)
  }

  private func updateInsets() {
    // The props land after the first layout has already parked the offset at the old inset,
    // and UIKit does not re-pin it, so a grown top inset would otherwise hide content
    // behind the chrome instead of reserving room for it.
    let wasPinnedToTop = collectionView.contentOffset.y <= -collectionView.adjustedContentInset.top + 1
    collectionView.contentInset = UIEdgeInsets(
      top: extraTopInset + queryHeaderHeight,
      left: 0,
      bottom: extraBottomInset,
      right: 0
    )
    if wasPinnedToTop {
      collectionView.setContentOffset(CGPoint(x: 0, y: -collectionView.adjustedContentInset.top), animated: false)
    }
  }

  @objc private func handleRefresh() {
    if let onNativeRefresh {
      onNativeRefresh()
    } else if let boundFeedKey {
      PhotoFeedStore.shared.load(boundFeedKey, force: true)
    }
  }

  @objc private func handleDatePress() {
    guard chromeDateInteractive else { return }
    onNativeDatePress?(dateButton)
  }

  @objc private func handleProfilePress() {
    onNativeProfilePress?(profileButton)
  }

  @objc private func handleFilterPress() {
    onNativeFilterPress?(filterButton)
  }

  private func toggleSelectionFromContextMenu(at indexPath: IndexPath) {
    guard selectionEnabled else { return }
    let enteredSelectionMode = !selectionMode
    if !selectionMode {
      selectionMode = true
      onNativeSelectionModeChange?(true)
    }
    toggleSelection(at: indexPath)
    if enteredSelectionMode {
      updateVisibleSelectionState()
    }
  }

  private func toggleSelection(at indexPath: IndexPath) {
    guard photos.indices.contains(indexPath.item) else { return }
    let id = photos[indexPath.item].id
    if selectedPhotoIds.contains(id) {
      selectedPhotoIds.remove(id)
    } else {
      selectedPhotoIds.insert(id)
    }
    haptics.impactOccurred()
    emitSelection()
    if let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell {
      cell.configureSelection(selectionMode: true, selected: selectedPhotoIds.contains(id))
    }
  }

  private func emitSelection() {
    let ids = photos.map(\.id).filter { selectedPhotoIds.contains($0) }
    onNativeSelectionChange?(ids)
  }

  private func updateVisibleSelectionState() {
    for indexPath in collectionView.indexPathsForVisibleItems {
      guard photos.indices.contains(indexPath.item),
            let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell else { continue }
      let id = photos[indexPath.item].id
      cell.configureSelection(selectionMode: selectionMode, selected: selectedPhotoIds.contains(id))
    }
  }

  private func makeContextMenuConfiguration(at indexPath: IndexPath) -> UIContextMenuConfiguration? {
    guard photos.indices.contains(indexPath.item) else { return nil }
    let photoId = photos[indexPath.item].id
    let hasStandardActions = !contextMenuInfoTitle.isEmpty || !contextMenuShareTitle.isEmpty
    let hasSelectionAction = selectionEnabled && !contextMenuSelectTitle.isEmpty
    guard hasStandardActions || hasSelectionAction else { return nil }

    return UIContextMenuConfiguration(identifier: photoId as NSString, previewProvider: nil) { [weak self] _ in
      guard let self else { return nil }
      var actions = [UIMenuElement]()

      if !self.contextMenuInfoTitle.isEmpty {
        actions.append(
          UIAction(title: self.contextMenuInfoTitle, image: UIImage(systemName: "info.circle")) { [weak self] _ in
            self?.emitContextMenuAction("info", photoId: photoId)
          }
        )
      }

      if !self.contextMenuShareTitle.isEmpty {
        actions.append(
          UIAction(title: self.contextMenuShareTitle, image: UIImage(systemName: "square.and.arrow.up")) {
            [weak self] _ in
            self?.emitContextMenuAction("share", photoId: photoId)
          }
        )
      }

      if self.selectionEnabled, !self.contextMenuSelectTitle.isEmpty {
        let selectionState: UIMenuElement.State = self.selectedPhotoIds.contains(photoId) ? .on : .off
        actions.append(
          UIAction(
            title: self.contextMenuSelectTitle,
            image: UIImage(systemName: "checkmark.circle"),
            state: selectionState
          ) { [weak self] _ in
            guard let self, let indexPath = self.indexPath(forPhotoId: photoId) else { return }
            self.toggleSelectionFromContextMenu(at: indexPath)
          }
        )
      }

      return UIMenu(children: actions)
    }
  }

  private func emitContextMenuAction(_ action: String, photoId: String) {
    onNativeContextMenuAction?(action, photoId)
  }

  private func indexPath(forPhotoId photoId: String) -> IndexPath? {
    guard let index = photos.firstIndex(where: { $0.id == photoId }) else { return nil }
    return IndexPath(item: index, section: 0)
  }

  private func indexPath(for configuration: UIContextMenuConfiguration) -> IndexPath? {
    guard let identifier = configuration.identifier as? NSString else { return nil }
    return indexPath(forPhotoId: identifier as String)
  }

  private func contextMenuPreview(at indexPath: IndexPath) -> UITargetedPreview? {
    guard let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell else { return nil }
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = .clear
    return UITargetedPreview(view: cell.contentView, parameters: parameters)
  }

  @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
    switch gesture.state {
    case .began:
      guard !photos.isEmpty else { return }
      settleGeneration += 1
      pinchStartPosition = layout.zoomPosition
      lastPinchDetent = Int(layout.zoomPosition.rounded())
      let location = gesture.location(in: collectionView)
      if let anchor = collectionView.indexPathForItem(at: location) {
        pinchAnchorItem = anchor.item
        pinchAnchorViewportOffset = layout.interpolatedFrame(at: anchor.item).midY - collectionView.contentOffset.y
      } else {
        pinchAnchorItem = nil
      }
      haptics.prepare()
    case .changed:
      guard !photos.isEmpty else { return }
      // Cell width scales with 1/columns, so the finger's scale maps inversely onto
      // the continuous column position — no per-step commits, no stalls.
      let position = clampPosition(pinchStartPosition / gesture.scale)
      applyZoomPosition(position)
      let detent = Int(position.rounded())
      if detent != lastPinchDetent {
        lastPinchDetent = detent
        haptics.impactOccurred()
      }
    case .ended, .cancelled, .failed:
      settlePinch(velocity: gesture.velocity)
    default:
      break
    }
  }

  private func clampPosition(_ position: CGFloat) -> CGFloat {
    min(
      max(position, CGFloat(minColumnCount)),
      CGFloat(maxAllowedColumnCount(for: collectionView.bounds.width))
    )
  }

  private func applyZoomPosition(_ position: CGFloat) {
    layout.zoomPosition = position
    layout.invalidateLayout()
    guard let anchorItem = pinchAnchorItem else { return }
    let frame = layout.interpolatedFrame(at: anchorItem)
    let minOffset = -collectionView.adjustedContentInset.top
    // Without the upper bound, pinching to more columns near the end of the list shortens
    // the content while the anchor keeps its viewport slot, parking blank space below the
    // last row.
    let contentBottom = layout.interpolatedContentHeight() + collectionView.adjustedContentInset.bottom
    let maxOffset = max(minOffset, contentBottom - collectionView.bounds.height)
    collectionView.contentOffset.y = min(max(frame.midY - pinchAnchorViewportOffset, minOffset), maxOffset)
  }

  private func settlePinch(velocity: CGFloat) {
    guard !photos.isEmpty else { return }
    // A pinch starting inside the 0.25s settle cancels this animation but still runs its
    // completion, which would nil the new gesture's anchor and emit a stale column count.
    settleGeneration += 1
    let generation = settleGeneration
    let current = layout.zoomPosition
    var target = current.rounded()
    if abs(velocity) > 1.5, current != current.rounded() {
      target = velocity > 0 ? current.rounded(.down) : current.rounded(.up)
    }
    target = clampPosition(target)
    let settled = Int(target)
    UIView.animate(
      withDuration: 0.25,
      delay: 0,
      options: [.curveEaseOut, .allowUserInteraction, .beginFromCurrentState],
      animations: {
        self.applyZoomPosition(target)
        self.collectionView.layoutIfNeeded()
      },
      completion: { _ in
        guard generation == self.settleGeneration else { return }
        self.pinchAnchorItem = nil
        if settled != self.columnCount {
          self.columnCount = settled
        }
        let settledItemWidth = self.layout.itemWidth
        self.preferredItemWidth = settledItemWidth
        self.onNativeColumnCountChange?(settled, settledItemWidth)
        self.emitVisibleRange()
      }
    )
  }

  private func emitVisibleRange() {
    guard !photos.isEmpty else { return }
    let indexPaths = collectionView.indexPathsForVisibleItems
    guard !indexPaths.isEmpty else { return }
    var start = Int.max
    var end = Int.min
    for indexPath in indexPaths {
      start = min(start, indexPath.item)
      end = max(end, indexPath.item)
    }
    guard start != lastReportedRange.start || end != lastReportedRange.end else { return }
    lastReportedRange = (start, end)
    onNativeVisibleRangeChange?(start, end)
  }
}

extension PhotoMasonryView: UICollectionViewDataSource {
  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    photos.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: PhotoCell.reuseIdentifier, for: indexPath) as! PhotoCell
    let photo = photos[indexPath.item]
    cell.configure(
      with: photo,
      targetWidth: layout.itemWidth,
      livePhotoAccessibilityLabel: livePhotoAccessibilityLabel,
      selectionMode: selectionMode,
      selected: selectedPhotoIds.contains(photo.id)
    )
    return cell
  }
}

extension PhotoMasonryView: UICollectionViewDelegate {
  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    if selectionMode {
      toggleSelection(at: indexPath)
      return
    }
    emitPhotoPress(at: indexPath)
  }

  private func emitPhotoPress(at indexPath: IndexPath) {
    guard photos.indices.contains(indexPath.item) else { return }
    onNativePhotoPress?(indexPath.item)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfigurationForItemsAt indexPaths: [IndexPath],
    point: CGPoint
  ) -> UIContextMenuConfiguration? {
    let indexPath = collectionView.indexPathForItem(at: point) ?? indexPaths.first
    guard let indexPath else { return nil }
    return makeContextMenuConfiguration(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfigurationForItemAt indexPath: IndexPath,
    point: CGPoint
  ) -> UIContextMenuConfiguration? {
    makeContextMenuConfiguration(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfiguration: UIContextMenuConfiguration,
    highlightPreviewForItemAt indexPath: IndexPath
  ) -> UITargetedPreview? {
    contextMenuPreview(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfiguration: UIContextMenuConfiguration,
    dismissalPreviewForItemAt indexPath: IndexPath
  ) -> UITargetedPreview? {
    contextMenuPreview(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    previewForHighlightingContextMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    guard let indexPath = indexPath(for: configuration) else { return nil }
    return contextMenuPreview(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    previewForDismissingContextMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    guard let indexPath = indexPath(for: configuration) else { return nil }
    return contextMenuPreview(at: indexPath)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    willPerformPreviewActionForMenuWith configuration: UIContextMenuConfiguration,
    animator: UIContextMenuInteractionCommitAnimating
  ) {
    guard !selectionMode, let indexPath = indexPath(for: configuration) else { return }
    animator.preferredCommitStyle = .dismiss
    animator.addCompletion { [weak self] in
      self?.emitPhotoPress(at: indexPath)
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let offset = scrollView.contentOffset.y + scrollView.adjustedContentInset.top
    updateFilterSummaryVisibility(offset: offset, animated: true)

    let now = CACurrentMediaTime()
    if now - lastVisibleRangeEmit > 0.12 {
      lastVisibleRangeEmit = now
      emitVisibleRange()
    }

    // Pinch zoom repositions contentOffset programmatically; only user-driven
    // scrolling should surface the date anchor.
    if scrollView.isDragging || scrollView.isDecelerating {
      if offset <= 1 {
        resetDateAnchor()
      } else {
        noteUserScroll()
      }
    }
  }

  func scrollViewDidScrollToTop(_ scrollView: UIScrollView) {
    resetDateAnchor()
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    emitVisibleRange()
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate {
      emitVisibleRange()
    }
  }
}

extension PhotoMasonryView: UICollectionViewDataSourcePrefetching {
  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    let urls = indexPaths.compactMap { indexPath -> URL? in
      guard photos.indices.contains(indexPath.item) else { return nil }
      return URL(string: photos[indexPath.item].url)
    }
    SDWebImagePrefetcher.shared.prefetchURLs(urls)
  }
}
