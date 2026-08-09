import UIKit

final class LoadingViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let indicator = UIActivityIndicatorView(style: .large)
    indicator.color = .white
    indicator.translatesAutoresizingMaskIntoConstraints = false
    indicator.startAnimating()
    view.addSubview(indicator)
    NSLayoutConstraint.activate([
      indicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      indicator.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
  }
}
