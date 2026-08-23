import { loadSkillTool } from "./load_skill_tool";
import { discoverSkills } from "../skills";

describe("loadSkillTool", () => {
  // 在所有测试开始前扫描一次技能目录,加载可用技能到缓存
  beforeAll(() => {
    discoverSkills();
  });

  // 用于在每个测试中监听 console.log,避免 测试输出 污染控制台,同时验证日志调用
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // 每个 test 执行前:替换 console.log 为空实现,屏蔽工具内部打印
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // 每个 test 执行后:恢复原始 console.log,避免影响后续测试
    consoleSpy.mockRestore();
  });

  it("loads an existing skill", async () => {
    const result = await loadSkillTool({ name: "planner" });
    expect(result).toContain("---");
    expect(result).toContain("# Planner");
    // 验证工具被调用时打印了预期的日志
    expect(consoleSpy).toHaveBeenCalledWith(
      '\n[Tool] load_skill called: "planner"',
    );
  });

  it("returns error for non-existent skill", async () => {
    const result = await loadSkillTool({ name: "nonexistent" });
    expect(result).toBe('Error: skill "nonexistent" not found.');
  });

  it("returns error for empty name", async () => {
    const result = await loadSkillTool({ name: "" });
    expect(result).toBe("Error: skill name is empty.");
  });

  it("returns error for whitespace-only name", async () => {
    const result = await loadSkillTool({ name: "   " });
    expect(result).toBe("Error: skill name is empty.");
  });
});
