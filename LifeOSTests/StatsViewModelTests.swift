import XCTest
@testable import LifeOS

final class StatsViewModelTests: XCTestCase {
    var viewModel: StatsViewModel!
    var testActions: [Action] = []
    var testDimensions: [Dimension] = []

    override func setUp() {
        super.setUp()
        viewModel = StatsViewModel()

        // 创建测试维度
        let career = Dimension(name: "职业发展", icon: "briefcase.fill", colorHex: "#4A90D9", sortOrder: 0, initialScore: 5)
        let health = Dimension(name: "身心健康", icon: "heart.fill", colorHex: "#E74C3C", sortOrder: 1, initialScore: 5)
        let growth = Dimension(name: "个人成长", icon: "brain.head.profile", colorHex: "#9B59B6", sortOrder: 2, initialScore: 5)
        testDimensions = [career, health, growth]

        // 创建测试行动（v2.0：使用 impact 和 quality）
        let today = Calendar.current.startOfDay(for: Date())
        testActions = [
            Action(date: today, descriptionText: "完成技术方案", impact: 3, quality: "major", dimension: career),
            Action(date: today, descriptionText: "跑步5km", impact: 2, quality: "normal", dimension: health),
            Action(date: today, descriptionText: "读书1小时", impact: 2, quality: "normal", dimension: growth),
            // 昨天
            Action(date: Calendar.current.date(byAdding: .day, value: -1, to: today)!,
                   descriptionText: "开会", impact: 1, quality: "minor", dimension: career),
            Action(date: Calendar.current.date(byAdding: .day, value: -1, to: today)!,
                   descriptionText: "健身", impact: 2, quality: "normal", dimension: health),
        ]
    }

    override func tearDown() {
        viewModel = nil
        testActions = []
        testDimensions = []
        super.tearDown()
    }

    // MARK: - 日统计

    func testDayStats() {
        viewModel.loadData(actions: testActions, dimensions: testDimensions)
        let dayStats = viewModel.dayStats(for: Date())

        XCTAssertEqual(dayStats.actions.count, 3, "今日应有 3 条行动")
        XCTAssertGreaterThan(dayStats.averageScore, 0, "今日评分应大于 0（基于 ScoringEngine）")
        XCTAssertEqual(dayStats.coveredDimensionCount, 3, "应覆盖 3 个维度")
    }

    func testDayStatsEmpty() {
        viewModel.loadData(actions: [], dimensions: testDimensions)
        let dayStats = viewModel.dayStats(for: Date())

        XCTAssertEqual(dayStats.actions.count, 0)
        // 空数据时分数应为初始分 5.0
        XCTAssertEqual(dayStats.averageScore, 5.0, accuracy: 0.1, "无行动时评分应等于初始分")
    }

    // MARK: - 周统计

    func testWeekStats() {
        viewModel.loadData(actions: testActions, dimensions: testDimensions)
        let weekStats = viewModel.weekStats(for: Date())

        XCTAssertEqual(weekStats.totalActions, 5, "本周应有 5 条行动")
        XCTAssertGreaterThan(weekStats.averageScore, 0, "周平均分应大于 0")
        XCTAssertEqual(weekStats.dimensionAverages.count, 3, "应有 3 个维度统计")
    }

    // MARK: - 月统计

    func testMonthStats() {
        viewModel.loadData(actions: testActions, dimensions: testDimensions)
        let monthStats = viewModel.monthStats(for: Date())

        XCTAssertEqual(monthStats.totalActions, 5)
        XCTAssertEqual(monthStats.daysWithActions, 2, "应覆盖 2 天")
    }

    // MARK: - 年统计

    func testYearStats() {
        viewModel.loadData(actions: testActions, dimensions: testDimensions)
        let yearStats = viewModel.yearStats(for: Date())

        XCTAssertEqual(yearStats.totalActions, 5)
        XCTAssertEqual(yearStats.dimensionAverages.count, 3)
    }
}
