import AVFoundation
import UIKit

enum LivePhotoPlaybackMode: String, CaseIterable {
  case live
  case loop
  case bounce
  case off

  var repeatsUntilStopped: Bool {
    self == .loop || self == .bounce
  }
}

/// Streams the paired MOV resource used by an Afilmory Live Photo.
///
/// Afilmory's manifest guarantees a logical image/video pair, but it does not
/// guarantee that the downloaded files retain the asset identifiers required
/// by `PHLivePhotoView`. Keeping playback in an `AVPlayerLayer` therefore gives
/// the native viewer deterministic behavior for remote and processed assets.
final class LivePhotoPlaybackView: UIView {
  override class var layerClass: AnyClass { AVPlayerLayer.self }

  private static let crossfadeDuration: TimeInterval = 0.3

  var onPlaybackStateChange: ((Bool) -> Void)?

  private(set) var isPlaying = false

  var mode: LivePhotoPlaybackMode = .live {
    didSet {
      guard mode != oldValue, mode == .off else { return }
      stopPlayback(animated: true)
    }
  }

  private var isActive = false
  private var playbackGeneration = 0
  private var videoURL: URL?
  private var player: AVPlayer?
  private var reverseProgressObserver: Any?
  private var layerReadinessObservation: NSKeyValueObservation?
  private var itemStatusObservation: NSKeyValueObservation?

  private var playerLayer: AVPlayerLayer {
    layer as! AVPlayerLayer
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    alpha = 0
    backgroundColor = .clear
    isUserInteractionEnabled = false
    playerLayer.backgroundColor = UIColor.clear.cgColor
    playerLayer.videoGravity = .resizeAspectFill
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  isolated deinit {
    tearDownPlayer()
  }

  func configure(videoURL: URL?) {
    guard self.videoURL != videoURL else { return }
    stopPlayback(animated: false)
    tearDownPlayer()
    self.videoURL = videoURL
    if isActive {
      preparePlayer()
    }
  }

  func setActive(_ active: Bool) {
    guard active != isActive else { return }
    isActive = active
    if active {
      preparePlayer()
    } else {
      stopPlayback(animated: false)
      tearDownPlayer()
    }
  }

  @discardableResult
  func startPlayback() -> Bool {
    guard isActive, mode != .off, videoURL != nil else { return false }
    preparePlayer()
    guard let player else { return false }

    playbackGeneration += 1
    let generation = playbackGeneration
    setPlaying(true)
    player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      guard finished else { return }
      DispatchQueue.main.async {
        guard let self, self.playbackGeneration == generation, self.isPlaying,
          let player = self.player
        else {
          return
        }
        player.play()
        if self.playerLayer.isReadyForDisplay {
          self.revealVideo()
        }
      }
    }
    return true
  }

  func stopPlayback(animated: Bool = true) {
    playbackGeneration += 1
    let generation = playbackGeneration
    stopReverseProgressObserver()
    player?.pause()
    setPlaying(false)
    // Rewinding while the layer is still on screen snaps the last frame back to
    // the first one mid-crossfade, so the seek waits until the fade has landed.
    hideVideo(animated: animated) { [weak self] in
      guard let self, self.playbackGeneration == generation else { return }
      self.player?.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
    }
  }

  private func preparePlayer() {
    guard player == nil, let videoURL else { return }

    let item = AVPlayerItem(url: videoURL)
    item.preferredForwardBufferDuration = 3

    let player = AVPlayer(playerItem: item)
    player.automaticallyWaitsToMinimizeStalling = true
    player.actionAtItemEnd = .pause
    self.player = player
    playerLayer.player = player

    // AVPlayer performs its own preroll when playback starts. Calling
    // preroll/cancelPendingPrerolls while the remote item is still `.unknown`
    // raises NSInvalidArgumentException instead of reporting an async failure.

    layerReadinessObservation = playerLayer.observe(
      \.isReadyForDisplay,
      options: [.new]
    ) { [weak self] layer, _ in
      guard layer.isReadyForDisplay else { return }
      DispatchQueue.main.async {
        guard let self, self.isPlaying else { return }
        self.revealVideo()
      }
    }

    itemStatusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      guard item.status == .failed else { return }
      DispatchQueue.main.async {
        guard let self, self.player?.currentItem === item else { return }
        self.stopPlayback(animated: true)
      }
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playbackReachedEnd(_:)),
      name: .AVPlayerItemDidPlayToEndTime,
      object: item
    )
  }

  @objc private func playbackReachedEnd(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem,
          player?.currentItem === item
    else { return }
    handlePlaybackReachedEnd()
  }

  private func handlePlaybackReachedEnd() {
    guard isPlaying else { return }
    switch mode {
    case .live, .off:
      stopPlayback(animated: true)
    case .loop:
      replayFromStart()
    case .bounce:
      playInReverse()
    }
  }

  private func replayFromStart() {
    guard let player else { return }
    let generation = playbackGeneration
    player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      guard finished else { return }
      DispatchQueue.main.async {
        guard let self, self.playbackGeneration == generation, self.isPlaying else {
          return
        }
        self.player?.play()
      }
    }
  }

  // Reverse playback needs a seekable item; progressive-download MP4s qualify but
  // HLS does not, so bounce degrades to a plain loop rather than stalling.
  private func playInReverse() {
    guard let player, player.currentItem?.canPlayReverse == true else {
      replayFromStart()
      return
    }
    startReverseProgressObserver()
    player.rate = -1
  }

  private func startReverseProgressObserver() {
    guard reverseProgressObserver == nil, let player else { return }
    reverseProgressObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(value: 1, timescale: 30),
      queue: .main
    ) { [weak self] time in
      DispatchQueue.main.async {
        guard let self, let player = self.player, player.rate < 0, time.seconds <= 0.05 else {
          return
        }
        self.stopReverseProgressObserver()
        guard self.isPlaying else { return }
        self.replayFromStart()
      }
    }
  }

  private func stopReverseProgressObserver() {
    guard let reverseProgressObserver else { return }
    player?.removeTimeObserver(reverseProgressObserver)
    self.reverseProgressObserver = nil
  }

  private func tearDownPlayer() {
    stopReverseProgressObserver()
    layerReadinessObservation?.invalidate()
    layerReadinessObservation = nil
    itemStatusObservation?.invalidate()
    itemStatusObservation = nil
    NotificationCenter.default.removeObserver(
      self,
      name: .AVPlayerItemDidPlayToEndTime,
      object: nil
    )
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    playerLayer.player = nil
    player = nil
  }

  private func setPlaying(_ playing: Bool) {
    guard playing != isPlaying else { return }
    isPlaying = playing
    onPlaybackStateChange?(playing)
  }

  // The crossfade is linear, so scaling the duration by the remaining distance
  // keeps a constant rate when a fade is reversed mid-flight. `alpha` already
  // holds the target during an in-flight fade, hence the presentation layer.
  private var displayedAlpha: CGFloat {
    guard let presentation = layer.presentation() else { return alpha }
    return CGFloat(presentation.opacity)
  }

  private func revealVideo() {
    guard alpha != 1 || displayedAlpha != 1 else { return }
    UIView.animate(
      withDuration: Self.crossfadeDuration * Double(1 - displayedAlpha),
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveLinear]
    ) {
      self.alpha = 1
    }
  }

  private func hideVideo(animated: Bool, completion: @escaping () -> Void) {
    let changes = { self.alpha = 0 }
    guard animated else {
      UIView.performWithoutAnimation(changes)
      completion()
      return
    }
    UIView.animate(
      withDuration: Self.crossfadeDuration * Double(displayedAlpha),
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveLinear],
      animations: changes
    ) { _ in
      completion()
    }
  }
}
