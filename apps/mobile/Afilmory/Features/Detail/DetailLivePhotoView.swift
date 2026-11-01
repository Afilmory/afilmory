import AVFoundation
import UIKit

final class DetailLivePhotoView: UIView {
  override class var layerClass: AnyClass { AVPlayerLayer.self }

  private var player: AVPlayer?
  private var endObserver: NSObjectProtocol?
  private(set) var isPlaying = false
  var videoURL: URL? {
    didSet {
      guard videoURL != oldValue else { return }
      stop(animated: false)
      player = nil
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    alpha = 0
    playerLayer.videoGravity = .resizeAspect
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    MainActor.assumeIsolated {
      if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }
  }

  private var playerLayer: AVPlayerLayer {
    layer as! AVPlayerLayer
  }

  func play() {
    guard let videoURL, !isPlaying else { return }
    if player == nil {
      let item = AVPlayerItem(url: FixtureMode.playableURL(for: videoURL))
      let player = AVPlayer(playerItem: item)
      player.isMuted = true
      player.actionAtItemEnd = .pause
      playerLayer.player = player
      self.player = player
      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.stop(animated: true) }
      }
    }
    try? AVAudioSession.sharedInstance().setCategory(.ambient)
    isPlaying = true
    player?.seek(to: .zero)
    player?.play()
    UIView.animate(withDuration: 0.2) { self.alpha = 1 }
  }

  func stop(animated: Bool) {
    guard isPlaying else { return }
    isPlaying = false
    player?.pause()
    let hide = { self.alpha = 0 }
    animated ? UIView.animate(withDuration: 0.25, animations: hide) : hide()
  }
}
