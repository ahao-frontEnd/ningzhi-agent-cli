import { webSearchTool } from "./web_search_tool";

/*
    jest.mock(moduleName, factory) 在所有 import 之前被提升（hoist）执行，
    把真实的 @langchain/tavily 模块替换成 factory 返回的假实现
*/
// 用 jest.mock 把 @langchain/tavily 模块替换为手动 mock，
// 避免测试时真的调用 Tavily API（需要网络和 API Key）
jest.mock("@langchain/tavily", () => {
  return {
    // TavilySearch 是一个 class，用 jest.fn + mockImplementation 模拟其构造函数，
    // 返回一个含有 invoke 方法（也是 mock）的实例对象
    TavilySearch: jest.fn().mockImplementation(() => ({
      invoke: jest.fn(),
    })),
  };
});

import { TavilySearch } from "@langchain/tavily";

// webSearchTool 内部调用 getEnv("TAVILY_API_KEY")，它会读取真实的
// ~/.ningzhiAgentCli/ningzhi.json。CI 环境没有该配置文件会直接抛错，
// 因此 mock config 模块，让测试不依赖任何机器上的真实配置文件。
jest.mock("../config", () => ({
  getEnv: jest.fn().mockReturnValue("test-tavily-api-key"),
}));

// jest.mocked() 把上面被 mock 的 TavilySearch 构造函数转为带类型信息的 mock，
// 这样才能调用 .mockImplementation() 等 mock 控制方法，便于在每个用例里自定义构造行为
const mockedTavilySearch = jest.mocked(TavilySearch);

describe("webSearchTool", () => {
  // 共享的 invoke mock：所有 TavilySearch 实例都会返回同一个 mock 函数，
  // 这样用例里只要对 mockInvoke 调用 mockResolvedValue / mockRejectedValue，
  // 就能控制 webSearchTool 内部真正执行的 tavily.invoke() 的返回值
  const mockInvoke = jest.fn();

  // 每个测试用例运行前执行，重置 mock 状态并重新绑定实现，确保用例之间互不污染
  beforeEach(() => {
    jest.clearAllMocks(); // 清空所有 mock 的调用记录和返回值配置
    // 让每次 new TavilySearch(...) 都返回一个对象，其 invoke 方法指向上面的 mockInvoke
    mockedTavilySearch.mockImplementation(
      () =>
        ({
          invoke: mockInvoke,
        }) as any,
    );
  });

  it("returns formatted search results", async () => {
    mockInvoke.mockResolvedValue({
      query: "test query",
      answer: "short answer",
      results: [
        {
          title: "Result 1",
          url: "https://example.com/1",
          content: "Content 1",
        },
        {
          title: "Result 2",
          url: "https://example.com/2",
          content: "Content 2",
        },
      ],
      response_time: 0.5,
    });

    const result = await webSearchTool({ query: "test query" });

    expect(mockInvoke).toHaveBeenCalledWith({ query: "test query" });
    expect(result).toContain("Query: test query");
    expect(result).toContain("Answer: short answer");
    expect(result).toContain("1. Result 1 (https://example.com/1)");
    expect(result).toContain("   Content 1");
    expect(result).toContain("2. Result 2 (https://example.com/2)");
    expect(result).toContain("   Content 2");
  });

  it("returns results without answer when answer is not present", async () => {
    mockInvoke.mockResolvedValue({
      query: "another query",
      results: [
        {
          title: "Only Result",
          url: "https://example.com/3",
          content: "Only content",
        },
      ],
      response_time: 0.3,
    });

    const result = await webSearchTool({ query: "another query" });

    expect(result).toContain("Query: another query");
    expect(result).not.toContain("Answer:");
    expect(result).toContain("1. Only Result (https://example.com/3)");
  });

  it("returns error when tavily returns an error", async () => {
    mockInvoke.mockResolvedValue({ error: "rate limit exceeded" });

    const result = await webSearchTool({ query: "bad query" });

    expect(result).toBe("Error: rate limit exceeded");
  });

  it("returns error when invoke throws", async () => {
    mockInvoke.mockRejectedValue(new Error("network error"));

    const result = await webSearchTool({ query: "fail query" });

    expect(result).toBe("Error: network error");
  });
});
