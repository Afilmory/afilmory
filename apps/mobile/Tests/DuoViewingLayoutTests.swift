@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoViewingLayoutTests: XCTestCase {
  private final class Source: NSObject, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    let counts: [Int]
    init(counts: [Int]) { self.counts = counts }
    func numberOfSections(in _: UICollectionView) -> Int { counts.count }
    func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int { counts[section] }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
      collectionView.dequeueReusableCell(withReuseIdentifier: "cell", for: indexPath)
    }

    func collectionView(_ collectionView: UICollectionView, layout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
      let width = (layout as? ViewingColumnsLayout)?.itemWidth(at: indexPath) ?? collectionView.bounds.width
      return CGSize(width: width, height: 120 + CGFloat(indexPath.item % 3) * 40)
    }

    func collectionView(_ collectionView: UICollectionView, layout _: UICollectionViewLayout, referenceSizeForHeaderInSection _: Int) -> CGSize {
      CGSize(width: collectionView.bounds.width, height: 40)
    }

    func collectionView(_ collectionView: UICollectionView, viewForSupplementaryElementOfKind kind: String, at indexPath: IndexPath) -> UICollectionReusableView {
      collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: "header", for: indexPath)
    }
  }

  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
  private var windows: [UIWindow] = []
  private var sources: [Source] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    sources = []
    super.tearDown()
  }

  private func laidOut(columns: [ClosedRange<CGFloat>], counts: [Int] = [5, 4]) -> (UICollectionView, Source) {
    let layout = ViewingColumnsLayout()
    layout.minimumLineSpacing = 12
    layout.sectionInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    layout.columns = columns
    let collection = UICollectionView(frame: CGRect(x: 0, y: 0, width: 882, height: 669), collectionViewLayout: layout)
    collection.register(UICollectionViewCell.self, forCellWithReuseIdentifier: "cell")
    collection.register(UICollectionReusableView.self, forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader, withReuseIdentifier: "header")
    let source = Source(counts: counts)
    sources.append(source)
    collection.dataSource = source
    collection.delegate = source
    let window = UIWindow(frame: collection.frame)
    window.addSubview(collection)
    window.isHidden = false
    windows.append(window)
    collection.reloadData()
    collection.layoutIfNeeded()
    return (collection, source)
  }

  private func itemFrames(_ collection: UICollectionView) -> [CGRect] {
    (0..<collection.numberOfSections).flatMap { section in
      (0..<collection.numberOfItems(inSection: section)).compactMap {
        collection.collectionViewLayout.layoutAttributesForItem(at: IndexPath(item: $0, section: section))?.frame
      }
    }
  }

  func testBookColumnsKeepEveryCardOnOnePage() {
    let columns = ViewingColumnsLayout.columns(
      for: DuoContext(barEdge: .trailing, posture: .book(fold: fold)),
      in: CGRect(x: 0, y: 0, width: 882, height: 669), fold: fold, inset: 16, spacing: 12
    )
    XCTAssertEqual(columns.count, 2)
    let (collection, _) = laidOut(columns: columns)
    let frames = itemFrames(collection)
    XCTAssertEqual(frames.count, 9)
    for frame in frames {
      XCTAssertTrue(frame.maxX <= fold.minX || frame.minX >= fold.maxX, "\(frame) crosses the fold")
    }
    XCTAssertEqual(Set(frames.map(\.minX)).count, 2)
    let headers = (0..<2).compactMap {
      collection.collectionViewLayout.layoutAttributesForSupplementaryView(
        ofKind: UICollectionView.elementKindSectionHeader, at: IndexPath(item: 0, section: $0)
      )?.frame
    }
    XCTAssertEqual(headers.count, 2)
    XCTAssertGreaterThanOrEqual(headers[1].minY, frames[..<5].map(\.maxY).max() ?? 0)
    XCTAssertGreaterThanOrEqual(collection.contentSize.height, frames.map(\.maxY).max() ?? 0)
  }

  func testFlatUsesThreeColumns() {
    let columns = ViewingColumnsLayout.columns(
      for: DuoContext(barEdge: .trailing, posture: .flat),
      in: CGRect(x: 0, y: 0, width: 882, height: 669), fold: nil, inset: 16, spacing: 12
    )
    XCTAssertEqual(columns.count, 3)
    let (collection, _) = laidOut(columns: columns)
    XCTAssertEqual(Set(itemFrames(collection).map(\.minX)).count, 3)
  }

  func testOneCardChaptersFillEveryFlatColumn() {
    let columns = ViewingColumnsLayout.columns(
      for: DuoContext(barEdge: .trailing, posture: .flat),
      in: CGRect(x: 0, y: 0, width: 882, height: 669), fold: nil, inset: 16, spacing: 12
    )
    let (collection, _) = laidOut(columns: columns, counts: [1, 1, 1, 1, 1, 1])
    let frames = itemFrames(collection)
    XCTAssertEqual(Set(frames.map(\.minX)).count, 3)
    for (section, item) in frames.enumerated() {
      let header = collection.collectionViewLayout.layoutAttributesForSupplementaryView(
        ofKind: UICollectionView.elementKindSectionHeader, at: IndexPath(item: 0, section: section)
      )?.frame ?? .null
      XCTAssertEqual(header.maxY, item.minY, accuracy: 0.5)
      XCTAssertEqual(header.maxX, item.maxX, accuracy: 0.5)
    }
  }

  func testPhonesKeepASingleFullWidthColumn() {
    let columns = ViewingColumnsLayout.columns(for: .phone, in: CGRect(x: 0, y: 0, width: 402, height: 874), fold: nil, inset: 16, spacing: 12)
    XCTAssertEqual(columns, [])
    let (collection, _) = laidOut(columns: columns)
    XCTAssertEqual(Set(itemFrames(collection).map(\.minX)), [16])
  }

  func testViewingPagesPickTheirColumnsFromTheContext() {
    let page = ViewingPageController(page: .galleries, model: ViewingModel(isVisitor: true))
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    window.rootViewController = page
    window.makeKeyAndVisible()
    windows.append(window)
    page.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    page.view.layoutIfNeeded()
    XCTAssertEqual(page.layout.columns.count, 2)
    XCTAssertLessThanOrEqual(page.layout.columns[0].upperBound, fold.minX)
    XCTAssertGreaterThanOrEqual(page.layout.columns[1].lowerBound, fold.maxX)
    page.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .flat)
    page.view.layoutIfNeeded()
    XCTAssertEqual(page.layout.columns.count, 3)
    page.traitOverrides.duoContext = .phone
    page.view.layoutIfNeeded()
    XCTAssertEqual(page.layout.columns, [])
  }
}
