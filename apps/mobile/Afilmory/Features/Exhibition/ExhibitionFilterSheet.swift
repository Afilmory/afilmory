import SwiftUI
import UIKit

struct ExhibitionFilterSheet: View {
  let options: PhotoFilterOptions
  let onApply: (PhotoFilters) -> Void
  @State var filters: PhotoFilters

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        searchField
        if !options.tags.isEmpty {
          section(String(localized: "Tags")) {
            Picker(String(localized: "Match"), selection: $filters.tagMode) {
              Text(String(localized: "Any tag")).tag(TagMode.any)
              Text(String(localized: "All tags")).tag(TagMode.all)
            }
            .pickerStyle(.segmented)
            chips(options.tags, selection: $filters.tags, userText: true)
          }
        }
        if !options.cameras.isEmpty {
          section(String(localized: "Cameras")) { chips(options.cameras, selection: $filters.cameras, userText: false) }
        }
        if !options.lenses.isEmpty {
          section(String(localized: "Lenses")) { chips(options.lenses, selection: $filters.lenses, userText: false) }
        }
        section(String(localized: "Date")) { datePresets }
        if options.ratedCount > 0 {
          section(String(localized: "Rating")) { ratingPicker }
        }
      }
      .padding(.horizontal, 22)
      .padding(.top, 4)
      .padding(.bottom, 16)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: 4) {
        Button(String(localized: "Apply")) { onApply(filters) }
          .buttonStyle(.afPrimary)
        Button(String(localized: "Reset")) { filters = .empty }
          .buttonStyle(.afText)
          .disabled(filters == .empty)
      }
      .padding(.horizontal, 22)
      .padding(.top, 10)
      .padding(.bottom, 18)
      .background(Color(AFColor.sheet))
    }
    .tint(Color(AFColor.textPrimary))
    .preferredColorScheme(.dark)
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").foregroundStyle(Color(AFColor.textTertiary))
      TextField(String(localized: "Titles, tags, cameras, places"), text: $filters.query)
        .font(Font(AFFont.exhibitUser(size: 17)))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .onSubmit { onApply(filters) }
      if !filters.query.isEmpty {
        Button {
          filters.query = ""
        } label: {
          Image(systemName: "xmark.circle.fill").foregroundStyle(Color(AFColor.textTertiary))
        }
        .accessibilityLabel(String(localized: "Clear search"))
      }
    }
    .padding(.horizontal, 14)
    .frame(height: 44)
    .background(Color(AFColor.fill), in: Capsule())
  }

  private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title.uppercased())
        .font(Font(AFFont.mono(size: 10)))
        .tracking(1)
        .foregroundStyle(Color(AFColor.textTertiary))
        .accessibilityAddTraits(.isHeader)
      content()
    }
  }

  private func chips(_ values: [PhotoFilterOption], selection: Binding<[String]>, userText: Bool) -> some View {
    ExhibitionChipFlow(spacing: 8) {
      ForEach(values) { option in
        let selected = selection.wrappedValue.contains(option.value)
        Button {
          if selected {
            selection.wrappedValue.removeAll { $0 == option.value }
          } else {
            selection.wrappedValue.append(option.value)
          }
        } label: {
          HStack(spacing: 6) {
            Text(option.value).font(userText ? Font(AFFont.exhibitUser(size: 14)) : .system(size: 13))
            Text("\(option.count)").font(Font(AFFont.mono(size: 10))).foregroundStyle(Color(AFColor.textTertiary))
          }
          .padding(.horizontal, 12)
          .frame(height: 32)
          .foregroundStyle(Color(selected ? AFColor.onLight : AFColor.textPrimary))
          .background(selected ? Color(AFColor.textPrimary) : Color.clear, in: Capsule())
          .overlay(Capsule().stroke(Color(AFColor.tick), lineWidth: selected ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
  }

  private var datePresets: some View {
    ExhibitionChipFlow(spacing: 8) {
      ForEach(DatePreset.allCases, id: \.self) { preset in
        let selected = filters.datePreset == preset
        Button {
          filters.datePreset = selected ? nil : preset
          if selected {
            filters.dateFrom = nil
            filters.dateTo = nil
          }
        } label: {
          Text(preset.label)
            .font(.system(size: 13))
            .padding(.horizontal, 12)
            .frame(height: 32)
            .foregroundStyle(Color(selected ? AFColor.onLight : AFColor.textPrimary))
            .background(selected ? Color(AFColor.textPrimary) : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(Color(AFColor.tick), lineWidth: selected ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
  }

  private var ratingPicker: some View {
    HStack(spacing: 6) {
      ForEach(1...5, id: \.self) { value in
        Button {
          filters.minRating = filters.minRating == value ? nil : value
        } label: {
          Image(systemName: (filters.minRating ?? 0) >= value ? "star.fill" : "star")
            .font(.system(size: 20))
            .foregroundStyle(Color(AFColor.textPrimary))
            .frame(width: 44, height: 44)
        }
        .accessibilityLabel(String(localized: "At least \(value) stars"))
      }
    }
  }
}

struct ExhibitionChipFlow: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
    let rows = arrange(width: proposal.width ?? 320, subviews: subviews)
    return CGSize(width: proposal.width ?? rows.width, height: rows.height)
  }

  func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += rowHeight + spacing
        rowHeight = 0
      }
      subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
    }
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> (width: CGFloat, height: CGFloat) {
    var x: CGFloat = 0
    var height: CGFloat = 0
    var rowHeight: CGFloat = 0
    var widest: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        height += rowHeight + spacing
        x = 0
        rowHeight = 0
      }
      x += size.width + spacing
      widest = max(widest, x)
      rowHeight = max(rowHeight, size.height)
    }
    return (widest, height + rowHeight)
  }
}

@MainActor
enum ExhibitionFilterPresenter {
  static func make(
    photos: [GalleryPhoto],
    onApply: @escaping (PhotoFilters) -> Void = { PhotoFilterStore.shared.replace($0) }
  ) -> AFSheetController {
    weak var sheet: AFSheetController?
    let view = ExhibitionFilterSheet(
      options: PhotoFilterEngine.buildOptions(photos),
      onApply: { filters in
        onApply(filters)
        sheet?.dismiss(animated: true)
      },
      filters: PhotoFilterStore.shared.filters
    )
    let controller = AFSheetController(title: String(localized: "Search & Filter"), detent: .fitAndExpanded, rootView: view)
    sheet = controller
    return controller
  }

  static func present(from presenter: UIViewController, photos: [GalleryPhoto]) {
    presenter.present(make(photos: photos), animated: true)
  }
}
