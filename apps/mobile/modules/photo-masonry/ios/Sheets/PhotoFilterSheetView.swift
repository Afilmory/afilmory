import SwiftUI

struct PhotoFilterSheetView: View {
  @ObservedObject var model: PhotoFilterViewModel

  var body: some View {
    Form {
      Section(String(localized: "Search Photos")) {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
          TextField(String(localized: "Search photos..."), text: $model.query)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
        }
      }

      Section(String(localized: "Date")) {
        Picker(String(localized: "Range"), selection: $model.dateSelection) {
          Text("Any Date").tag(PhotoFilterViewModel.noDate)
          ForEach(DatePreset.allCases, id: \.rawValue) { preset in
            Text(preset.label).tag(preset.rawValue)
          }
          Text("Custom Range").tag(PhotoFilterViewModel.customDate)
        }

        if model.dateSelection == PhotoFilterViewModel.customDate {
          DatePicker(
            String(localized: "From"),
            selection: $model.dateFrom,
            in: ...model.dateTo,
            displayedComponents: .date
          )
          DatePicker(
            String(localized: "To"),
            selection: $model.dateTo,
            in: model.dateFrom...,
            displayedComponents: .date
          )
        }
      }

      if !model.options.tags.isEmpty {
        Section(String(localized: "Tags")) {
          if model.tags.count > 1 {
            Picker(String(localized: "Match"), selection: $model.tagMode) {
              Text("Any").tag("any")
              Text("All").tag("all")
            }
            .pickerStyle(.segmented)
          }
          ForEach(model.options.tags) { option in
            SelectionRow(
              count: option.count,
              isSelected: model.tags.contains(option.value),
              title: option.value,
              onSelect: { model.toggleTag(option.value) }
            )
          }
        }
      }

      if !model.options.cameras.isEmpty {
        Section(String(localized: "Camera")) {
          ForEach(model.options.cameras) { option in
            SelectionRow(
              count: option.count,
              isSelected: model.cameras.contains(option.value),
              title: option.value,
              onSelect: { model.toggleCamera(option.value) }
            )
          }
        }
      }

      if !model.options.lenses.isEmpty {
        Section(String(localized: "Lens")) {
          ForEach(model.options.lenses) { option in
            SelectionRow(
              count: option.count,
              isSelected: model.lenses.contains(option.value),
              title: option.value,
              onSelect: { model.toggleLens(option.value) }
            )
          }
        }
      }

      if model.options.ratedCount > 0 {
        Section(String(localized: "Rating")) {
          Picker(String(localized: "Minimum Rating"), selection: $model.minRating) {
            Text("Any Rating").tag(Int?.none)
            ForEach(1...5, id: \.self) { rating in
              Text("\(rating) Stars or Better").tag(Int?.some(rating))
            }
          }
        }
      }

      if model.hasActiveFilters {
        Section {
          Button(String(localized: "Reset Filters"), role: .destructive, action: model.reset)
            .frame(maxWidth: .infinity, alignment: .center)
        }
      }
    }
  }
}

private struct SelectionRow: View {
  let count: Int
  let isSelected: Bool
  let title: String
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 12) {
        Image(systemName: "checkmark")
          .font(.body.weight(.semibold))
          .foregroundStyle(.tint)
          .frame(width: 20, alignment: .leading)
          .opacity(isSelected ? 1 : 0)
          .accessibilityHidden(true)

        Text(title)
          .foregroundStyle(.primary)

        Spacer()

        Text(count, format: .number)
          .foregroundStyle(.secondary)
          .monospacedDigit()
          .frame(minWidth: 36, alignment: .trailing)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityValue(isSelected ? String(localized: "Selected") : String(localized: "Not selected"))
  }
}
