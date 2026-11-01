#if DEBUG
  import UIKit

  final class UICatalogController: UITableViewController {
    private lazy var groups: [(name: String, entries: [CatalogEntry])] = {
      var order: [String] = []
      var grouped: [String: [CatalogEntry]] = [:]
      for entry in UICatalog.entries where entry.id != "shell.catalog" {
        if grouped[entry.group] == nil { order.append(entry.group) }
        grouped[entry.group, default: []].append(entry)
      }
      return order.map { ($0, grouped[$0] ?? []) }
    }()

    init() {
      super.init(style: .insetGrouped)
      title = "UI Catalog"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
      super.viewDidLoad()
      tableView.register(UITableViewCell.self, forCellReuseIdentifier: "entry")
      navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
        self?.dismiss(animated: true)
      })
      navigationItem.prompt = "Scenario: \(FixtureMode.isOn ? FixtureMode.scenario.rawValue : "live")"
    }

    override func numberOfSections(in _: UITableView) -> Int {
      groups.count
    }

    override func tableView(_: UITableView, numberOfRowsInSection section: Int) -> Int {
      groups[section].entries.count
    }

    override func tableView(_: UITableView, titleForHeaderInSection section: Int) -> String? {
      groups[section].name
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
      let entry = groups[indexPath.section].entries[indexPath.row]
      let cell = tableView.dequeueReusableCell(withIdentifier: "entry", for: indexPath)
      var content = UIListContentConfiguration.subtitleCell()
      content.text = entry.title
      content.secondaryText = "\(entry.id) · \(entry.scenario.rawValue)"
      content.secondaryTextProperties.font = AFFont.mono(size: 11)
      content.secondaryTextProperties.color = .secondaryLabel
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = entry.id
      cell.accessoryType = .disclosureIndicator
      return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
      tableView.deselectRow(at: indexPath, animated: true)
      let entry = groups[indexPath.section].entries[indexPath.row]
      let presenter = presentingViewController
      dismiss(animated: true) {
        guard let presenter else { return }
        UICatalog.open(entry, over: presenter)
      }
    }
  }
#endif
