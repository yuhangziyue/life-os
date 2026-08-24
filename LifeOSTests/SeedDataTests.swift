import XCTest
@testable import LifeOS

final class SeedDataTests: XCTestCase {

    func testSeedDataDefinitions() {
        // 验证 8 个维度
        XCTAssertEqual(SeedData.dimensionDefs.count, 8, "应有 8 个维度")

        // 验证每个维度至少有 3 个二度分支
        for def in SeedData.dimensionDefs {
            XCTAssertGreaterThanOrEqual(def.branches.count, 3, "\(def.name) 应有至少 3 个二度分支")

            for branch in def.branches {
                XCTAssertGreaterThanOrEqual(branch.children.count, 2, "\(branch.name) 应有至少 2 个三度分支")
            }
        }
    }

    func testDimensionNames() {
        let names = SeedData.dimensionDefs.map(\.name)
        let expected = ["职业发展", "财务状况", "个人成长", "身心健康", "家庭关系", "社交关系", "休闲娱乐", "精神/意义"]
        XCTAssertEqual(names, expected, "维度名称应与标准生命之花一致")
    }

    func testTotalLeafCount() {
        let totalLeaves = SeedData.dimensionDefs.reduce(0) { total, dim in
            total + dim.branches.reduce(0) { $0 + $1.children.count }
        }
        XCTAssertEqual(totalLeaves, 96, "应有 96 个三度叶子节点（8维度 × 4分支 × 3叶子）")
    }
}
