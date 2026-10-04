# 因 abort 导致的孤立 tool_calls 问题复盘

## 一、问题现象

在 AI 调用工具的过程中按 ESC 取消请求后，之后的每一次对话都会失败，报错：

```
400 An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. (insufficient tool messages following tool_calls message)
```

整个会话彻底卡死，必须 `/new` 开启新会话才能恢复。

## 二、问题根因

### 2.1 LangGraph 的消息持久化机制

本项目使用 LangGraph + SqliteSaver 作为 checkpointer。Agent 执行过程中，**每条消息生成后都会立即被持久化**到 SQLite，而不是等整轮请求结束后才写入。

### 2.2 故障链

```
用户输入 → model_request 节点 → AI 生成 AIMessage(tool_calls=[web_search])
                                        ↓
                              SqliteSaver 持久化该 AIMessage
                                        ↓
                              进入 toolNode（interrupt 等待用户确认）
                                        ↓
                              用户按 ESC → controller.abort()
                                        ↓
                              流被中断，toolNode 未执行，ToolMessage 从未写入
                                        ↓
                    消息历史变成: [..., HumanMessage, AIMessage(tool_calls)]
                                        ↓
                              缺少与 tool_calls 对应的 ToolMessage → 非法历史
                                        ↓
                    下一次请求 → API 返回 400 insufficient tool messages
                                        ↓
                              之后所有请求都失败，会话卡死
```

### 2.3 关键时序点

AIMessage（带 tool_calls）的持久化发生在**用户按 ESC 之前**。所以 abort 时，数据库里已经存在一条"承诺要调用工具"的 AIMessage，但对应的 ToolMessage 永远不会产生。

## 三、修复方案

### 3.1 核心思路

在 abort 发生后，主动为每个没有对应 ToolMessage 的孤立 tool_call 补充一条 `"Operation cancelled by user."` 的 ToolMessage，使消息历史恢复合法。

### 3.2 实现：`cleanupOrphanedToolCalls`

文件：`src/agent/agent.ts`

```typescript
async function cleanupOrphanedToolCalls(
  compiledAgent: CompiledStateGraph<any, any, any>,
  config: any,
): Promise<void> {
  const state = await compiledAgent.getState(config);
  const messages: BaseMessage[] = state.values?.messages ?? [];
  if (messages.length === 0) return;

  // 找到最后一条带 tool_calls 的 AIMessage
  const lastAIMessage = [...messages]
    .reverse()
    .find(
      (m): m is AIMessage => AIMessage.isInstance(m) && !!m.tool_calls?.length,
    );
  if (!lastAIMessage?.tool_calls?.length) return;

  // 收集已有 ToolMessage 对应的 tool_call_id
  const respondedToolCallIds = new Set(
    messages
      .filter((m) => m.type === "tool")
      .map((m) => (m as ToolMessage).tool_call_id),
  );

  // 找出没有对应 ToolMessage 的 tool_calls
  const orphanToolCalls = lastAIMessage.tool_calls.filter(
    (call) => call.id && !respondedToolCallIds.has(call.id),
  );
  if (orphanToolCalls.length === 0) return;

  // 为每个未完成的 tool_call 添加"已取消"消息
  const cancelMessages = orphanToolCalls.map(
    (call) =>
      new ToolMessage({
        content: "Operation cancelled by user.",
        tool_call_id: call.id ?? "",
        name: call.name,
      }),
  );
  await compiledAgent.updateState(config, { messages: cancelMessages });
}
```

### 3.3 调用时机

在 `_runAgent` 的 `catch` 块中，当检测到 `signal.aborted` 时先调用清理函数，再重新抛出错误：

```typescript
} catch (err) {
  if (signal?.aborted) {
    await cleanupOrphanedToolCalls(compiledAgent, config);
  }
  throw err;
}
```

### 3.4 CLI 层的 abort 识别优化

文件：`src/agent/cli.ts`

原来只静默处理手动抛出的 `"abort"` 字符串错误，但流底层（LangChain/LangGraph）抛出的是 `AbortError`（`name === "AbortError"`，message 为 `"This operation was aborted"`），会被当成普通错误显示给用户。

```typescript
function isAbort(err: unknown): boolean {
  const e = err as Error;
  return (
    e?.name === "AbortError" ||
    e?.message === "abort" ||
    /abort/i.test(e?.message ?? "")
  );
}
```

## 四、修复效果

| 场景                | 修复前                 | 修复后           |
| ------------------- | ---------------------- | ---------------- |
| AI 回复文本时按 ESC | 正常，下次可继续       | 正常，下次可继续 |
| AI 调用工具时按 ESC | 下次请求 400，会话卡死 | 下次请求正常     |
| 工具确认环节按 ESC  | 下次请求 400，会话卡死 | 下次请求正常     |

## 五、经验总结

1. **持久化时机是关键**：LangGraph 的 checkpointer 是逐步写入的，不是整轮事务。abort 时数据库里可能已有部分消息，不能假设"abort 就等于什么都没发生"。

2. **tool_calls 必须有对应的 ToolMessage**：这是 OpenAI API 的硬性约束。AIMessage.tool_calls 中的每个 id 都必须有一条 type=tool、tool_call_id 匹配的 ToolMessage 紧随其后。

3. **清理失败不能掩盖原始错误**：`cleanupOrphanedToolCalls` 内部用 try/catch 包裹，清理失败时静默忽略，不影响 abort 错误的正常抛出。

4. **AbortError 有两种来源**：手动 `throw new Error("abort")` 和流底层的 `AbortError`（name 属性），需要同时识别。

## 六、相关文件

- `src/agent/agent.ts` — `cleanupOrphanedToolCalls` 函数 + `_runAgent` catch 块
- `src/agent/cli.ts` — `isAbort` 判断逻辑
