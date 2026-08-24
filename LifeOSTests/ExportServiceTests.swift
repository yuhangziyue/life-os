import XCTest
@testable import LifeOS

final class ExportServiceTests: XCTestCase {

    func testCSVExport() {
        let today = Calendar.current.startOfDay(for: Date())
        let dim = Dimension(name: "职业发展", icon: "briefcase", colorHex: "#000", sortOrder: 0)
        let actions = [
            Action(date: today, descriptionText: "测试行动", impact: 2, quality: "normal", dimension: dim)
        ]

        XCTAssertNoThrow(try ExportService.exportCSV(actions: actions))
    }

    func testJSONExport() {
        let dim = Dimension(name: "测试", icon: "star", colorHex: "#000", sortOrder: 0)
        let actions: [Action] = []
        let reviews: [Review] = []

        XCTAssertNoThrow(try ExportService.exportJSON(actions: actions, dimensions: [dim], reviews: reviews))
    }

    func testRoundTripJSON() {
        let dim = Dimension(name: "测试维度", icon: "star.fill", colorHex: "#FF0000", sortOrder: 0, initialScore: 5)
        let branch = Branch(name: "测试分支", level: 1, sortOrder: 0, dimension: dim)
        let goal = Goal(title: "测试目标", descriptionText: "测试描述", quantitativeTarget: 10, currentValue: 3, unit: "次", dimension: dim)
        let action = Action(date: Date(), descriptionText: "测试行动", impact: 2, quality: "normal", dimension: dim, branch: branch)
        let review = Review(periodType: "week", periodStart: Date(), periodEnd: Date(), reflectionText: "测试反思", autoSummary: "测试摘要")

        // 导出
        let url = try! ExportService.exportJSON(
            actions: [action],
            dimensions: [dim],
            reviews: [review]
        )

        // 验证导出文件存在
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
    }
}
