由于项目使用了 `SqliteSaver` 持久化状态，`todoList` 具备以下特性：

- **跨多轮对话保持状态**：压缩上下文或退出重进后，todo 列表依然存在
- **不受 context compression 影响**：`SqliteSaver` 会自动持久化该字段
- **可在 prompt 中注入**：每轮 model_request 前，若存在 todo 列表，会通过 `formatTodoListForPrompt` 格式化为系统消息注入（[`agent.ts:147-153`](../src/agent/agent.ts#L147-L153)）

## 终端可视化

每次 todo 状态更新后，会在控制台打印彩色的进度列表（[`colors.ts:65-83`](../src/agent/colors.ts#L65-L83)）：

| 状态        | 符号 | 颜色                    |
| ----------- | ---- | ----------------------- |
| pending     | ○    | gray                    |
| in_progress | →    | blueBright              |
| completed   | ✓    | greenBright（文字变灰） |
| failed      | ✗    | redBright（文字变灰）   |

## 设计动机总结

| 原因                    | 说明                                                  |
| ----------------------- | ----------------------------------------------------- |
| 让 LLM 可见可调用       | 必须注册为工具，LLM 才会在 tool_calls 中发起调用      |
| 状态化管理              | todo 列表需要作为工作流状态持久化，不能只靠工具返回值 |
| 绕过工具执行开销        | 不需要真正执行 I/O 操作，直接改状态更高效             |
| dummy 函数是安全网      | 拦截失败时返回明确错误，避免静默失败                  |
| 可持久化、可注入 prompt | 基于 LangGraph 状态，天然支持持久化和上下文注入       |

> 一句话概括：**"注册是为了让 LLM 看见，拦截是为了自己处理，dummy 是兜底保险"**。
