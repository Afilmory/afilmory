import UIKit

final class ViewingController: UIViewController, ViewingPageHost {
  let isVisitor: Bool
  private let onRequestSignIn: () -> Void
  private let model: ViewingModel
  private let transition = ViewingGalleryTransition()
  private lazy var rolls = ViewingRollsPage(model: model)
  private lazy var galleries = ViewingGalleriesPage(model: model)
  private var pager: ViewingPager!
  private var header: ViewingHeaderBar!
  private var signInButton: UIButton?
  private var observation: ViewingModel.Observation?
  private var userHasChosenPage = false
  private var didApplyFetchedDefault = false
  private var isReceded = false
  private var isOpeningPhoto = false
  private var accents: [ViewingPage: UIColor] = [:]

  init(isVisitor: Bool, onRequestSignIn: @escaping () -> Void) {
    self.isVisitor = isVisitor
    self.onRequestSignIn = onRequestSignIn
    model = ViewingModel(isVisitor: isVisitor)
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var currentPage: ViewingPage {
    loadViewIfNeeded()
    return pager.currentPage
  }

  override func viewIsAppearing(_ animated: Bool) {
    super.viewIsAppearing(animated)
    applyVerticalBar()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    let pages: [ViewingPageController] = isVisitor ? [galleries] : [rolls, galleries]
    pages.forEach { $0.host = self }
    let initial = ViewingPage.initial(
      isVisitor: isVisitor,
      isSignedIn: model.isSignedIn,
      cachedHasSubscriptions: model.cachedHasSubscriptions()
    )
    pager = ViewingPager(pages: pages, initial: initial)
    signInButton = isVisitor ? makeSignInButton() : nil
    header = ViewingHeaderBar(pages: pages.map(\.page), trailing: signInButton)
    DuoBarItems.observe(self) { $0.applyVerticalBar() }
    applyVerticalBar()
    addChild(pager.controller)
    pager.controller.view.frame = view.bounds
    pager.controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(pager.controller.view)
    pager.controller.didMove(toParent: self)
    header.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(header)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    header.onSelect = { [weak self] page in self?.select(page, animated: true) }
    header.setProgress(CGFloat(pages.firstIndex { $0.page == initial } ?? 0))
    pager.onProgress = { [weak self] progress in self?.header.setProgress(progress) }
    pager.onSettle = { [weak self] page in self?.pageSettled(page) }
    observation = model.observe { [weak self] change in self?.modelChanged(change) }
    model.start()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    pager.attach()
    let height = header.frame.height
    for page in pager.pages where page.headerHeight != height {
      page.headerHeight = height
    }
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController?.delegate = transition
    if isReceded {
      isReceded = false
      let content = view!
      if let coordinator = transitionCoordinator, animated {
        // The pop sets this view's frame after viewWillAppear; with the recede scale still applied UIKit inflates
        // bounds to frame / scale and the page lays out oversized until completion, so scale only after that.
        let receded = content.transform
        content.transform = .identity
        // AFBlurView's scrubbed radius doesn't render inside the system pop; an alpha fade is driven by the transition itself.
        coordinator.animate(alongsideTransition: { _ in
          UIView.performWithoutAnimation { content.transform = receded }
          AFMotion.refocusAlongsideTransition(content)
        }) { context in
          if context.isCancelled {
            ViewingGalleryTransition.recede(content)
          } else {
            ViewingGalleryTransition.restore(content, animated: false)
          }
          self.isReceded = context.isCancelled
        }
      } else {
        ViewingGalleryTransition.restore(content, animated: false)
      }
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if !isReceded, view.transform != .identity || view.alpha < 1 {
      ViewingGalleryTransition.restore(view, animated: animated)
    }
    pager.visiblePage?.reportCurrentAccent()
  }

  func select(_ page: ViewingPage, animated: Bool) {
    loadViewIfNeeded()
    userHasChosenPage = true
    if page == pager.currentPage {
      pager.visiblePage?.scrollToTop(animated: animated)
    }
    pager.show(page, animated: animated)
  }

  func openGallery(_ route: GalleryRouteRequest, level: ContactSheetLevel = .day) {
    loadViewIfNeeded()
    let gallery = ExhibitionController(
      source: .gallery(slug: route.slug, header: nil),
      onRequestSignIn: onRequestSignIn
    )
    push(gallery)
    gallery.show(level: level, focusingPhotoID: route.photoID)
  }

  private func openGallery(header: GalleryHeaderModel) {
    let gallery = ExhibitionController(
      source: .gallery(slug: header.slug, header: header),
      onRequestSignIn: onRequestSignIn
    )
    push(gallery)
  }

  private func push(_ controller: UIViewController) {
    guard let navigationController else { return }
    navigationController.delegate = transition
    if navigationController.topViewController !== self {
      navigationController.popToViewController(self, animated: false)
    }
    isReceded = view.window != nil
    navigationController.pushViewController(controller, animated: view.window != nil)
  }

  private func applyVerticalBar() {
    let usesBar = traitCollection.duoContext.hasVerticalBar
    signInButton?.isHidden = usesBar
    let items = isVisitor
      ? [DuoBarItems.symbol("person.crop.circle", label: String(localized: "Sign in")) { [weak self] in self?.onRequestSignIn() }]
      : []
    DuoBarItems.install(items, on: self)
  }

  private func makeSignInButton() -> UIButton {
    let button = AFGlassButton.titled(String(localized: "Sign in")) { [weak self] in self?.onRequestSignIn() }
    button.setContentHuggingPriority(.required, for: .horizontal)
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
    return button
  }

  private func pageSettled(_ page: ViewingPage) {
    header.lock(page)
    applyAccent(for: page)
    pager.visiblePage?.reportCurrentAccent()
  }

  private func modelChanged(_ change: ViewingModel.Change) {
    guard change == .subscriptions, !isVisitor, model.subscriptionsLoaded, !didApplyFetchedDefault else { return }
    didApplyFetchedDefault = true
    let next = ViewingPage.afterFetch(
      current: pager.currentPage,
      userHasChosen: userHasChosenPage,
      hasSubscriptions: !model.subscriptions.isEmpty
    )
    if next != pager.currentPage { pager.show(next, animated: false) }
  }

  private func applyAccent(for page: ViewingPage) {
    let color = accents[page] ?? AFColor.accentFallback
    header.accent = color
    guard view.window != nil, navigationController?.topViewController === self else { return }
    AppNavigator.shared.setFocusAccent(color)
  }

  func pageOpenGallery(_ header: GalleryHeaderModel) {
    openGallery(header: header)
  }

  func pageOpenPhoto(
    _ cover: GalleryCoverPhoto,
    covers: [GalleryCoverPhoto],
    gallery: GalleryHeaderModel,
    source: @escaping (String) -> UIView?
  ) {
    guard !isOpeningPhoto else { return }
    isOpeningPhoto = true
    Task { [weak self] in
      let photos = await ViewingPhotoLoader.shared.photos(slug: gallery.slug, ids: covers.map(\.id))
      guard let self else { return }
      isOpeningPhoto = false
      guard let index = photos.firstIndex(where: { $0.id == cover.id }) else {
        openGallery(GalleryRouteRequest(requestId: UUID().uuidString, slug: gallery.slug, title: gallery.name, photoID: cover.id))
        return
      }
      PhotoDetailPresenter.present(photos: photos, index: index, gallerySlug: gallery.slug, from: self, sourceProvider: source)
    }
  }

  func pageAccentChanged(_ color: UIColor, page: ViewingPage) {
    accents[page] = color
    if page == pager.currentPage { applyAccent(for: page) }
  }

  func pageShowGalleries() {
    select(.galleries, animated: true)
  }

  func pageRequestSignIn() {
    onRequestSignIn()
  }

  func pageFollowFailed(_ error: Error) {
    if case APIError.unauthorized = error {
      AfilmorySessionStore.shared.refreshSession()
      onRequestSignIn()
      return
    }
    guard presentedViewController == nil else { return }
    let alert = UIAlertController(
      title: String(localized: "Couldn’t update subscription"),
      message: String(localized: "Check your connection and try again."),
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }

  #if DEBUG
    func catalogSearch(_ query: String) {
      select(.galleries, animated: false)
      galleries.setQuery(query)
    }
  #endif
}
