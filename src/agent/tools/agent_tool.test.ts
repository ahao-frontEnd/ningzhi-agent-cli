import { agentTool } from "./agent_tool";

// 完整 mock ../agent 模块，只用 jest.fn() 替换 runSubAgent
// 这样 agentTool 内部调用 runSubAgent 时不会真正启动子 agent，
// 测试里可用 mockResolvedValue 控制返回值并断言调用参数
jest.mock("../agent", () => ({
  runSubAgent: jest.fn(),
}));

import { runSubAgent } from "../agent";
const mockedRunSubAgent = jest.mocked(runSubAgent);

describe("agentTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns subagent result for valid prompt", async () => {
    mockedRunSubAgent.mockResolvedValue("subagent result");

    const result = await agentTool({ prompt: "do something" });

    expect(mockedRunSubAgent).toHaveBeenCalledWith("do something");
    expect(result).toBe("subagent result");
  });

  it("trims prompt whitespace", async () => {
    mockedRunSubAgent.mockResolvedValue("trimmed result");

    const result = await agentTool({ prompt: "  do something  " });

    expect(mockedRunSubAgent).toHaveBeenCalledWith("do something");
    expect(result).toBe("trimmed result");
  });

  it("returns error for empty prompt", async () => {
    const result = await agentTool({ prompt: "" });

    expect(result).toBe("Error: prompt is empty.");
    expect(mockedRunSubAgent).not.toHaveBeenCalled();
  });

  it("returns error for whitespace-only prompt", async () => {
    const result = await agentTool({ prompt: "   " });

    expect(result).toBe("Error: prompt is empty.");
    expect(mockedRunSubAgent).not.toHaveBeenCalled();
  });
});
