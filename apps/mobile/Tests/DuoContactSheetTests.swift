@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoContactSheetTests: XCTestCase {
  private func group(_ key: String, year: Int, frames: Int) -> ContactSheetGroup {
    ContactSheetGroup(
      key: key, title: key, year: year, level: .day,
      frames: (0..<frames).map { ContactSheetFrame(photoID: "\(key)-\($0)", number: $0 + 1, width: 108) }
    )
  }

  private var groups: [ContactSheetGroup] {
    [group("a", year: 2026, frames: 3), group("b", year: 2026, frames: 2), group("c", year: 2026, frames: 1),
     group("d", year: 2026, frames: 4), group("e", year: 2025, frames: 2), group("f", year: 2025, frames: 1)]
  }

  func testOneLaneMatchesTheExistingPacking() {
    let single = ContactSheetLayout.pack(groups: groups, laneWidths: [358])
    XCTAssertEqual(single.map(\.block), ContactSheetLayout.pack(groups: groups, width: 358))
    XCTAssertTrue(single.allSatisfy { $0.lane == 0 || $0.block.dividerYear != nil })
  }

  func testTwoLanesAlternateAndNeverOverflowTheirPage() {
    let widths: [CGFloat] = [406, 338]
    let placements = ContactSheetLayout.pack(groups: groups, laneWidths: widths)
    let rows = placements.filter { $0.block.groups != nil }
    XCTAssertGreaterThan(rows.count, 2)
    for placement in rows {
      let width = (placement.block.groups ?? []).map(\.stripWidth).reduce(0, +)
        + ContactSheetLayout.groupGap * CGFloat(max(0, (placement.block.groups?.count ?? 1) - 1))
      XCTAssertTrue(width <= widths[placement.lane] || placement.block.groups?.count == 1)
    }
    XCTAssertEqual(Array(rows.prefix(2).map(\.lane)), [0, 1])
    XCTAssertTrue(placements.filter { $0.block.dividerYear != nil }.allSatisfy { $0.lane == ContactSheetPlacement.spanning })
    XCTAssertEqual(placements.flatMap { $0.block.groups ?? [] }.map(\.key), groups.map(\.key))
  }

  func testSheetLayoutPutsLanesOnTheirPagesSideBySide() {
    let layout = ExhibitionSheetLayout()
    layout.heroHeight = 200
    layout.lanes = [0...470, 480...882]
    let placements = ContactSheetLayout.pack(groups: groups, laneWidths: [438, 370])
    layout.placements = placements.map { ExhibitionSheetLayout.Placement(height: $0.block.height(level: .day), lane: $0.lane) }
    let collection = UICollectionView(frame: CGRect(x: 0, y: 0, width: 882, height: 669), collectionViewLayout: layout)
    let source = BlockSource(count: placements.count)
    collection.dataSource = source
    let window = UIWindow(frame: collection.frame)
    window.addSubview(collection)
    window.isHidden = false
    collection.layoutIfNeeded()
    let frames = (0..<placements.count).compactMap { layout.frameOfBlock($0) }
    XCTAssertEqual(frames.count, placements.count)
    for (placement, frame) in zip(placements, frames) {
      switch placement.lane {
      case 0: XCTAssertLessThanOrEqual(frame.maxX, 470)
      case 1: XCTAssertGreaterThanOrEqual(frame.minX, 480)
      default: XCTAssertEqual(frame.width, 882)
      }
    }
    let firstPair = Array(frames.prefix(3))
    XCTAssertEqual(firstPair[1].minY, firstPair[2].minY)
    window.isHidden = true
    withExtendedLifetime(source) {}
  }

  func testTheOpenerSplitsAcrossTheSpread() {
    let hero = ExhibitionHeroView()
    hero.availableHeight = 669
    hero.topInset = 60
    hero.spread = (left: CGRect(x: 0, y: 0, width: 470, height: 669), right: CGRect(x: 480, y: 0, width: 402, height: 669))
    hero.frame = CGRect(x: 0, y: 0, width: 882, height: hero.height(for: 882))
    hero.layoutIfNeeded()
    XCTAssertLessThanOrEqual(hero.opener.frame.maxX, 470)
    XCTAssertGreaterThanOrEqual(hero.header.frame.minX, 480)
    XCTAssertGreaterThanOrEqual(hero.bounds.height, hero.opener.frame.maxY)
  }

  func testExhibitionSplitsItsSheetIntoPagesOnlyInBookPosture() {
    let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
    let exhibition = ExhibitionController(source: .own, onRequestSignIn: {})
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    window.rootViewController = exhibition
    window.makeKeyAndVisible()
    exhibition.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    exhibition.view.layoutIfNeeded()
    let pages = exhibition.sheetPages()
    XCTAssertEqual(pages.count, 2)
    XCTAssertLessThanOrEqual(pages[0].maxX, fold.minX)
    XCTAssertGreaterThanOrEqual(pages[1].minX, fold.maxX)
    exhibition.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .flat)
    XCTAssertEqual(exhibition.sheetPages().count, 1)
    window.isHidden = true
  }

  private final class BlockSource: NSObject, UICollectionViewDataSource {
    let count: Int
    init(count: Int) { self.count = count }
    func numberOfSections(in _: UICollectionView) -> Int { 2 }
    func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int { section == 0 ? 1 : count }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
      collectionView.register(UICollectionViewCell.self, forCellWithReuseIdentifier: "c")
      return collectionView.dequeueReusableCell(withReuseIdentifier: "c", for: indexPath)
    }
  }
}
