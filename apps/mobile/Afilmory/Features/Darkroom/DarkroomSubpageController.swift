import SwiftUI
import UIKit

final class DarkroomSubpageController: UIViewController {
  let route: StudioHomeRoute?
  private let pageTitle: String
  private let content: UIViewController
  private lazy var header = DarkroomHeaderBar.subpage(title: pageTitle) { [weak self] in
    self?.navigationController?.popViewController(animated: true)
  }
  private var scrollObservation: NSKeyValueObservation?

  init(title: String, route: StudioHomeRoute?, content: UIViewController) {
    pageTitle = title
    self.route = route
    self.content = content
    super.init(nibName: nil, bundle: nil)
    self.title = title
  }

  convenience init<Content: View>(title: String, route: StudioHomeRoute?, swiftUI: Content) {
    let host = UIHostingController(rootView: swiftUI.darkroomPage())
    host.view.backgroundColor = AFColor.ground
    self.init(title: title, route: route, content: host)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewIsAppearing(_ animated: Bool) {
    super.viewIsAppearing(animated)
    applyVerticalBar()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    overrideUserInterfaceStyle = .dark
    addChild(content)
    content.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(content.view)
    view.addSubview(header)
    NSLayoutConstraint.activate([
      content.view.topAnchor.constraint(equalTo: view.topAnchor),
      content.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      content.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      content.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    content.didMove(toParent: self)
    DuoBarItems.observe(self) { $0.applyVerticalBar() }
    applyVerticalBar()
  }

  private func applyVerticalBar() {
    header.backButton?.isHidden = traitCollection.duoContext.hasVerticalBar
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard scrollObservation == nil, let scrollView = Self.firstScrollView(in: content.view) else { return }
    scrollObservation = scrollView.observe(\.contentOffset, options: [.initial, .new]) { [weak self] scrollView, _ in
      MainActor.assumeIsolated {
        let visible = DarkroomHeaderBar.showsChrome(
          contentOffsetY: scrollView.contentOffset.y,
          adjustedTopInset: scrollView.adjustedContentInset.top
        )
        self?.header.setChromeVisible(visible, animated: true)
      }
    }
  }

  private static func firstScrollView(in root: UIView) -> UIScrollView? {
    var queue = [root]
    while !queue.isEmpty {
      let view = queue.removeFirst()
      if let scrollView = view as? UIScrollView { return scrollView }
      queue.append(contentsOf: view.subviews)
    }
    return nil
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    content.additionalSafeAreaInsets.top = DarkroomHeaderBar.contentHeight
  }
}

struct DarkroomPageStyle: ViewModifier {
  func body(content: Content) -> some View {
    content
      .scrollContentBackground(.hidden)
      .background(Color(AFColor.ground).ignoresSafeArea())
      .tint(Color(AFColor.textPrimary))
      .environment(\.colorScheme, .dark)
      .toolbar(.hidden, for: .navigationBar)
  }
}

struct DarkroomRowStyle: ViewModifier {
  func body(content: Content) -> some View {
    content
      .listRowBackground(Color(AFColor.raised))
      .listRowSeparatorTint(Color(AFColor.hairline))
  }
}

extension View {
  func darkroomPage() -> some View {
    modifier(DarkroomPageStyle())
  }

  func darkroomRows() -> some View {
    modifier(DarkroomRowStyle())
  }

  func darkroomForm() -> some View {
    scrollContentBackground(.hidden)
      .background(Color(AFColor.ground))
      .environment(\.defaultMinListRowHeight, 56)
      .listSectionSpacing(22)
      .tint(Color(AFColor.accentFallback))
  }
}

extension Color {
  static let darkroomTertiary = Color(AFColor.textTertiary)
  static let darkroomSecondary = Color(AFColor.textSecondary)
  static let darkroomDestructive = Color(AFColor.destructive)
}

struct DarkroomSectionHeader: View {
  let title: String

  var body: some View {
    Text(title.uppercased())
      .font(Font(AFFont.mono(size: 11)))
      .tracking(0.6)
      .foregroundStyle(Color(AFColor.textTertiary))
      .textCase(nil)
      .accessibilityAddTraits(.isHeader)
  }
}

struct DarkroomSection<Content: View>: View {
  let title: String
  let content: Content

  init(_ title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  var body: some View {
    Section {
      content
    } header: {
      DarkroomSectionHeader(title: title)
    }
  }
}
