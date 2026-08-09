import ImageIO
import MapKit
import SwiftUI

struct PhotoHistogramView: View {
  @StateObject private var loader: PhotoHistogramLoader
  let failedMessage: String
  let accessibilityLabel: String

  init(urlString: String, failedMessage: String, accessibilityLabel: String) {
    self.failedMessage = failedMessage
    self.accessibilityLabel = accessibilityLabel
    _loader = StateObject(wrappedValue: PhotoHistogramLoader(urlString: urlString))
  }

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(Color.black.opacity(0.62))

      switch loader.state {
      case .loading:
        ProgressView()
          .tint(.secondary)
      case .failed:
        Label(failedMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(.secondary)
      case .loaded(let histogram):
        PhotoHistogramCanvas(histogram: histogram)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }
}

struct PhotoMapPreview: View {
  let latitude: Double
  let longitude: Double
  let accessibilityLabel: String

  var body: some View {
    ZStack {
      PhotoMapViewRepresentable(latitude: latitude, longitude: longitude)
        .allowsHitTesting(false)

      Circle()
        .fill(Color.accentColor)
        .frame(width: 10, height: 10)
        .overlay {
          Circle()
            .stroke(Color.white.opacity(0.9), lineWidth: 2)
        }
        .shadow(color: .black.opacity(0.28), radius: 3, y: 1)
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }
}

private struct PhotoMapViewRepresentable: UIViewRepresentable {
  let latitude: Double
  let longitude: Double

  func makeUIView(context: Context) -> MKMapView {
    let mapView = MKMapView(frame: .zero)
    mapView.isPitchEnabled = false
    mapView.isRotateEnabled = false
    mapView.isScrollEnabled = false
    mapView.isZoomEnabled = false
    mapView.mapType = .mutedStandard
    mapView.pointOfInterestFilter = .excludingAll
    return mapView
  }

  func updateUIView(_ mapView: MKMapView, context: Context) {
    let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    let region = MKCoordinateRegion(
      center: center,
      span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
    )
    mapView.setRegion(region, animated: false)
  }
}

private struct PhotoHistogram: Sendable {
  let red: [Double]
  let green: [Double]
  let blue: [Double]
  let luminance: [Double]

  var maximumValue: Double {
    [
      red.max() ?? 0,
      green.max() ?? 0,
      blue.max() ?? 0,
      luminance.max() ?? 0,
    ].max() ?? 0
  }
}

@MainActor
private final class PhotoHistogramLoader: ObservableObject {
  enum State {
    case loading
    case loaded(PhotoHistogram)
    case failed
  }

  @Published private(set) var state: State = .loading

  private var request: Task<Void, Never>?

  init(urlString: String) {
    load(urlString: urlString)
  }

  deinit {
    request?.cancel()
  }

  private func load(urlString: String) {
    guard let url = URL(string: urlString) else {
      state = .failed
      return
    }

    request = Task { [weak self] in
      do {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let response = response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode)
        else {
          self?.state = .failed
          return
        }
        let histogram = await Task.detached(priority: .utility) {
          PhotoHistogramLoader.calculateHistogram(data: data)
        }.value
        guard !Task.isCancelled else { return }
        self?.state = histogram.map(State.loaded) ?? .failed
      } catch {
        guard !Task.isCancelled else { return }
        self?.state = .failed
      }
    }
  }

  nonisolated private static func calculateHistogram(data: Data) -> PhotoHistogram? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
      return nil
    }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 300,
    ]
    guard
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else {
      return nil
    }

    let width = image.width
    let height = image.height
    guard width > 0, height > 0 else {
      return nil
    }

    let bytesPerPixel = 4
    let bytesPerRow = width * bytesPerPixel
    var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo =
      CGBitmapInfo.byteOrder32Big.rawValue
      | CGImageAlphaInfo.premultipliedLast.rawValue

    let didDraw = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard
        let baseAddress = buffer.baseAddress,
        let context = CGContext(
          data: baseAddress,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: bytesPerRow,
          space: colorSpace,
          bitmapInfo: bitmapInfo
        )
      else {
        return false
      }

      context.interpolationQuality = .medium
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }

    guard didDraw else {
      return nil
    }

    let binCount = 128
    var red = [Double](repeating: 0, count: binCount)
    var green = [Double](repeating: 0, count: binCount)
    var blue = [Double](repeating: 0, count: binCount)
    var luminance = [Double](repeating: 0, count: binCount)

    for offset in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
      let redValue = pixels[offset]
      let greenValue = pixels[offset + 1]
      let blueValue = pixels[offset + 2]
      red[Int(redValue) >> 1] += 1
      green[Int(greenValue) >> 1] += 1
      blue[Int(blueValue) >> 1] += 1

      let redLuminance = 0.2126 * Double(redValue)
      let greenLuminance = 0.7152 * Double(greenValue)
      let blueLuminance = 0.0722 * Double(blueValue)
      let luminanceValue = Int(redLuminance + greenLuminance + blueLuminance)
      luminance[min(binCount - 1, luminanceValue >> 1)] += 1
    }

    return PhotoHistogram(red: red, green: green, blue: blue, luminance: luminance)
  }
}

private struct PhotoHistogramCanvas: View {
  let histogram: PhotoHistogram

  var body: some View {
    Canvas { context, size in
      drawGrid(context: &context, size: size)

      let maximumValue = histogram.maximumValue
      guard maximumValue > 0 else {
        return
      }

      draw(
        histogram.luminance,
        color: .white.opacity(0.3),
        blendMode: .normal,
        maximumValue: maximumValue,
        context: &context,
        size: size
      )
      draw(
        histogram.red, color: Color(red: 1, green: 0.41, blue: 0.38).opacity(0.7),
        maximumValue: maximumValue, context: &context, size: size)
      draw(
        histogram.green, color: Color(red: 0.2, green: 0.78, blue: 0.35).opacity(0.7),
        maximumValue: maximumValue, context: &context, size: size)
      draw(
        histogram.blue, color: Color(red: 0.25, green: 0.61, blue: 1).opacity(0.7),
        maximumValue: maximumValue, context: &context, size: size)
    }
  }

  private func drawGrid(context: inout GraphicsContext, size: CGSize) {
    for index in 1...3 {
      let y = size.height * CGFloat(index) / 4
      var path = Path()
      path.move(to: CGPoint(x: 0, y: y))
      path.addLine(to: CGPoint(x: size.width, y: y))
      context.stroke(path, with: .color(.white.opacity(0.05)), lineWidth: 0.5)
    }
  }

  private func draw(
    _ bins: [Double],
    color: Color,
    blendMode: GraphicsContext.BlendMode = .screen,
    maximumValue: Double,
    context: inout GraphicsContext,
    size: CGSize
  ) {
    guard !bins.isEmpty, maximumValue > 0 else {
      return
    }

    let barWidth = size.width / CGFloat(bins.count)
    var bars = Path()
    for (index, value) in bins.enumerated() where value > 0 {
      let barHeight = size.height * CGFloat(value / maximumValue)
      bars.addRect(
        CGRect(
          x: CGFloat(index) * barWidth,
          y: size.height - barHeight,
          width: max(0.5, barWidth * 0.8),
          height: barHeight
        )
      )
    }

    var channelContext = context
    channelContext.blendMode = blendMode
    channelContext.fill(bars, with: .color(color))
  }
}
