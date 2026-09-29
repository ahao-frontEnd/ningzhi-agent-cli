import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// context.ts 会 import model.ts，而 model.ts 在模块加载的顶层就执行 getModelConfig()
// 读取真实的 ~/.ningzhiAgentCli/ningzhi.json。CI 环境没有该文件会在 import 阶段直接抛错，
// 导致整个测试套件 “failed to run”。mock config 后测试只验证纯函数逻辑，与机器配置无关。
jest.mock("./config", () => ({
  getModelConfig: () => ({
    model: "test-model",
    apiKey: "test-api-key",
    baseURL: "https://example.com/v1",
  }),
}));

import { findSafeCompressionIndex } from "./context";

describe("findSafeCompressionIndex", () => {
  const makeAIMessage = (toolCalls?: { id: string; name: string }[]) =>
    new AIMessage({
      content: "",
      tool_calls: toolCalls?.map((c) => ({
        id: c.id,
        name: c.name,
        args: {},
        type: "tool_call",
      })),
    });

  const makeToolMessage = (toolCallId: string, name: string) =>
    new ToolMessage({
      content: "result",
      tool_call_id: toolCallId,
      name,
    });

  test("no tool messages: keeps exact minKeep", () => {
    const messages = [
      new HumanMessage("1"),
      new HumanMessage("2"),
      new HumanMessage("3"),
      new HumanMessage("4"),
      new HumanMessage("5"),
      new HumanMessage("6"),
      new HumanMessage("7"),
      new HumanMessage("8"),
    ];
    // length=8, minKeep=6 → index=2
    expect(findSafeCompressionIndex(messages, 6)).toBe(2);
  });

  test("tool pair fully inside keep region: no adjustment needed", () => {
    const messages = [
      new HumanMessage("old"),
      makeAIMessage([{ id: "a", name: "search" }]),
      makeToolMessage("a", "search"),
      new HumanMessage("recent"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
    ];
    // length=10, minKeep=6 → index=4
    // [4..9] has no ToolMessage, so safeIndex stays 4
    expect(findSafeCompressionIndex(messages, 6)).toBe(4);
  });

  test("boundary cuts at ToolMessage: pulls back to include its AIMessage", () => {
    const messages = [
      new HumanMessage("old"),
      new HumanMessage("old"),
      new HumanMessage("old"),
      makeAIMessage([{ id: "a", name: "search" }]),
      makeToolMessage("a", "search"),
      new HumanMessage("recent"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
      new HumanMessage("keep"),
    ];
    // length=12, minKeep=6 → raw index=6
    // [6..11] has no ToolMessage, but let's make boundary cut at ToolMessage
    expect(findSafeCompressionIndex(messages, 6)).toBe(6);

    // Now make boundary cut at ToolMessage
    // length=12, minKeep=2 → raw index=10
    // [10..11] no ToolMessage
    // But if minKeep=3 → raw index=9, [9..11] no ToolMessage
    // If minKeep=4 → raw index=8, [8..11] no ToolMessage
    // If minKeep=5 → raw index=7, [7..11] no ToolMessage
    // If minKeep=6 → raw index=6, [6..11] no ToolMessage
    // Hmm, let me create a case where ToolMessage is exactly at boundary
  });

  test("ToolMessage at exact boundary: pulls back to AIMessage", () => {
    const messages = [
      new HumanMessage("old"),
      makeAIMessage([{ id: "a", name: "search" }]),
      makeToolMessage("a", "search"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
    ];
    // length=7, minKeep=5 → raw index=2
    // [2..6] includes ToolMessage('a') → need to pull back to AIMessage at index 1
    expect(findSafeCompressionIndex(messages, 5)).toBe(1);
  });

  test("multiple tool calls in one AIMessage: pulls back to include all", () => {
    const messages = [
      new HumanMessage("old"),
      makeAIMessage([
        { id: "a", name: "search" },
        { id: "b", name: "read" },
      ]),
      makeToolMessage("a", "search"),
      makeToolMessage("b", "read"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
    ];
    // length=8, minKeep=5 → raw index=3
    // [3..7] includes ToolMessage('b') → need to pull back
    // prev at 2 is ToolMessage('a') → add 'a'
    // prev at 1 is AIMessage with 'a' and 'b' → matches! index=1
    expect(findSafeCompressionIndex(messages, 5)).toBe(1);
  });

  test("chained tool calls: pulls back through chain", () => {
    const messages = [
      new HumanMessage("old"),
      makeAIMessage([{ id: "a", name: "search" }]),
      makeToolMessage("a", "search"),
      makeAIMessage([{ id: "b", name: "read" }]),
      makeToolMessage("b", "read"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
    ];
    // length=8, minKeep=4 → raw index=4
    // [4..7] includes ToolMessage('b') → pull back
    // prev at 3 is AIMessage('b') → matches, index=3, add 'b'
    // prev at 2 is ToolMessage('a') → add 'a', index=2
    // prev at 1 is AIMessage('a') → matches, index=1, add 'a'
    // prev at 0 is HumanMessage → break
    expect(findSafeCompressionIndex(messages, 4)).toBe(1);
  });

  test("real bug scenario: web_search_tool:2 with incomplete pair", () => {
    // Simulating the exact error: "web_search_tool:2" ToolMessage is kept
    // but its AIMessage is compressed away
    const messages = [
      new HumanMessage("old"),
      makeAIMessage([{ id: "web_search_tool:1", name: "web_search" }]),
      makeToolMessage("web_search_tool:1", "web_search"),
      makeAIMessage([{ id: "web_search_tool:2", name: "web_search" }]),
      makeToolMessage("web_search_tool:2", "web_search"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
    ];
    // length=11, minKeep=6 → raw index=5
    // [5..10] has no ToolMessage
    // Let's make a case where it does cut at ToolMessage
    // length=11, minKeep=3 → raw index=8
    // [8..10] has no ToolMessage... need different arrangement

    // Arrange so ToolMessage is at index 5 (boundary when minKeep=6)
    const messages2 = [
      new HumanMessage("1"),
      new HumanMessage("2"),
      new HumanMessage("3"),
      new HumanMessage("4"),
      makeAIMessage([{ id: "web_search_tool:2", name: "web_search" }]),
      makeToolMessage("web_search_tool:2", "web_search"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
      new HumanMessage("recent"),
    ];
    // length=11, minKeep=6 → raw index=5
    // [5..10] includes ToolMessage('web_search_tool:2')
    // prev at 4 is AIMessage with 'web_search_tool:2' → matches, index=4
    expect(findSafeCompressionIndex(messages2, 6)).toBe(4);
  });

  test("minKeep larger than messages: returns 0", () => {
    const messages = [
      makeAIMessage([{ id: "a", name: "search" }]),
      makeToolMessage("a", "search"),
    ];
    expect(findSafeCompressionIndex(messages, 6)).toBe(0);
  });

  test("empty messages: returns 0", () => {
    expect(findSafeCompressionIndex([], 6)).toBe(0);
  });
});
